# React16 事件源码浅析

@(react)

### 缘起
为什么不允许在原生 js 中使用循环添加事件，但是在 React 中使用循环添加事件却是理所当然？

### 源码片段
从使用的角度，将源码里面我们必须要掌握的知识点挑出来看看。


#### 事件绑定
事件的绑定是在 Fiber 调度工作完成之后的事情，主要经过了下图红框中的几个函数。
![event](https://github.com/104gogo/Invoker/raw/master/images/react/event.png)

需要注意的是：
- 事件是委托给 document 对象的，使用了事件代理的方式
- 使用了 addEventListener 方法，分别绑定了捕获和冒泡两个阶段的事件
- 使用 dispatch 方法作为统一的事件回调函数入口

##### 获取 document 对象
React 会将所有事件监听在 document 对象上面，除了媒体（media）事件。
```javascript
// react-dom/src/client/ReactDOMComponent.js
function ensureListeningTo(rootContainerElement, registrationName) {
  // 判断当前节点是不是 document
  const isDocumentOrFragment =
    rootContainerElement.nodeType === DOCUMENT_NODE ||
    rootContainerElement.nodeType === DOCUMENT_FRAGMENT_NODE;
  // 不是的话，就从 ownerDocument 中取 document
  const doc = isDocumentOrFragment
    ? rootContainerElement
    : rootContainerElement.ownerDocument;

  listenTo(registrationName, doc); // 这里的 doc 就是 document
}
```
> [Node.ownerDocument](https://developer.mozilla.org/zh-CN/docs/Web/API/Node/ownerDocument) 只读属性会返回当前节点的顶层的 document 对象。

##### 事件冒泡和捕获分类
`捕获阶段`的事件有 scroll、blur、focus、cancel、close。使用 trapCapturedEvent 方法进行绑定。  
`冒泡阶段`的事件是除了 media 和上面的5个事件的其他事件。使用 trapBubbledEvent 方法进行绑定。
```javascript
// react-dom/src/events/ReactBrowserEventEmitter.js
export function listenTo(
  registrationName: string,
  mountAt: Document | Element,
) {
  const isListening = getListeningForDocument(mountAt);
  const dependencies = registrationNameDependencies[registrationName];

  for (let i = 0; i < dependencies.length; i++) {
    const dependency = dependencies[i];
    if (!(isListening.hasOwnProperty(dependency) && isListening[dependency])) {
      switch (dependency) {
        case TOP_SCROLL: // scroll
        case TOP_FOCUS: // focus
        case TOP_BLUR: // blur
          trapCapturedEvent(TOP_SCROLL, mountAt);
          trapCapturedEvent(TOP_FOCUS, mountAt);
          trapCapturedEvent(TOP_BLUR, mountAt);
          break;
        case TOP_CANCEL: // cancel
        case TOP_CLOSE: // close
          if (isEventSupported(getRawEventName(dependency))) {
            trapCapturedEvent(dependency, mountAt);
          }
          break;
        default:
          // By default, listen on the top level to all non-media events.
          // Media events don't bubble so adding the listener wouldn't do anything.
          const isMediaEvent = mediaEventTypes.indexOf(dependency) !== -1;
          if (!isMediaEvent) {
            trapBubbledEvent(dependency, mountAt);
          }
          break;
      }
      isListening[dependency] = true; // 这里记录监听了的 dependency 事件
    }
  }
}
```

##### 统一的事件处理方法
dispatchEvent 是一个基础的事件调用入口方法。  
dispatchInteractiveEvent 是对 dispatchEvent 的包装，多了优先级的设置。如果当前事件是高优先级的事件，就会将当前的优先级设置为了`UserBlockingPriority`（值为2），再执行 dispatchEvent 方法。
```javascript
// react-dom/src/events/ReactDOMEventListener.js
export function trapBubbledEvent(
  topLevelType: DOMTopLevelEventType,
  element: Document | Element,
) {
  if (!element) {
    return null;
  }
  const dispatch = isInteractiveTopLevelEventType(topLevelType)
    ? dispatchInteractiveEvent
    : dispatchEvent;

  addEventBubbleListener(
    element,
    getRawEventName(topLevelType),
    // Check if interactive and wrap in interactiveUpdates
    dispatch.bind(null, topLevelType),
  );
}
```

> 这里`dispatch.bind(null, topLevelType)`利用 bind 方法柯里化的特性，先传一个参数过去，后面再接收一个原生的 nativeEvent 对象。

##### 熟悉的 addEventListener
```javascript
// react-dom/src/events/EventListener.js
export function addEventBubbleListener(
  element: Document | Element,
  eventType: string,
  listener: Function,
): void {
  element.addEventListener(eventType, listener, false);
}

export function addEventCaptureListener(
  element: Document | Element,
  eventType: string,
  listener: Function,
): void {
  element.addEventListener(eventType, listener, true);
}
```
element 是 document 对象。
addEventListener 是原生的事件绑定方法，这里分别绑定了捕获和冒泡两个阶段的事件。刚好兼容到 IE9。
> IE<=8 instead only supports the `proprietary .attachEvent() method`. It also does not support the `capture phase` of DOM event dispatch; it only supports event bubbling.

listener 是统一的事件处理方法（即上面的 dispatch 方法）。

#### 事件处理
React 的事件中一共有5个事件插件，它们分别对不同类型的事件做处理，然后返回接口统一的合成事件对象。

##### SyntheticEvent（事件合成方法）
SyntheticEvent 方法会通过继承的方式，生成 Animation、Clipboard、Focus、Keyboard 等10多个事件合成方法。它主要的功能有：
- 用 nativeEvent 生成统一的事件合成对象。React 事件回调函数的参数 event 对象，就是从这里来的。
- 维护事件池（eventPool）数组
  - 从 eventPool 数组中取一个事件对象，生成新的合成事件
  - 事件执行完成之后，清理合成事件对象，放回 eventPool 数组

需要注意的是，不要在异步方法中使用 event，因为事件回调函数执行完成之后，这个对象就被回收了。

##### 模拟捕获和冒泡
从 event.target 节点开始，通过 fiber.return 的方式遍历父节点，然后获取捕获和冒泡阶段的事件回调函数。
```javascript
// shared/ReactTreeTraversal.js
export function traverseTwoPhase(inst, fn, arg) {
  const path = [];
  // 循环查找父节点，存在 path 数组中
  while (inst) {
    path.push(inst);
    inst = getParent(inst);
  }
  let i;
  // 捕获阶段，获取路径节点上面绑定的事件回调函数
  for (i = path.length; i-- > 0; ) {
    fn(path[i], 'captured', arg);
  }
  // 冒泡阶段，获取路径节点上面绑定的事件回调函数
  for (i = 0; i < path.length; i++) {
    fn(path[i], 'bubbled', arg);
  }
}
```
将找到的回调函数存在`合成事件对象的 _dispatchListeners 数组`中，待后面使用。

##### 获取组件上的事件
```javascript
// events/EventPluginHub.js
export function getListener(inst: Fiber, registrationName: string) {
  let listener;
  // live here; needs to be moved to a better place soon
  const stateNode = inst.stateNode;

  const props = getFiberCurrentPropsFromNode(stateNode);
  
  listener = props[registrationName]; // 获取组件上定义的回调函数
  
  return listener;
}
```
getListener 方法会在上面的循环中被一次次的被调用，从而获取到组件上定义的回调函数。

##### 事件执行
event._dispatchListeners 数组里面存的事件回调函数，是按照捕获到冒泡的顺序收集的，所以执行的时候也是按照这个顺序。
```javascript
// events/EventPluginUtils.js
export function executeDispatchesInOrder(event) {
  const dispatchListeners = event._dispatchListeners;
  const dispatchInstances = event._dispatchInstances;
  if (__DEV__) {
    validateEventDispatches(event);
  }
  if (Array.isArray(dispatchListeners)) {
    for (let i = 0; i < dispatchListeners.length; i++) {
      if (event.isPropagationStopped()) {
        break;
      }
      // Listeners and Instances are two parallel arrays that are always in sync.
      executeDispatch(event, dispatchListeners[i], dispatchInstances[i]);
    }
  } else if (dispatchListeners) {
    executeDispatch(event, dispatchListeners, dispatchInstances);
  }
  event._dispatchListeners = null;
  event._dispatchInstances = null;
}
```
从上面代码可以看出：
- 事件回调函数的 event 是共享的
- event 在所有回调函数执行完毕会进行重制，然后回收
- ⚠️ React 合成事件对象的 e.stopPropagation，只能阻止 React 模拟的事件冒泡，并不能阻止真实的 DOM 事件冒泡

### 参考文档

[React 事件代理与 stopImmediatePropagation](https://github.com/youngwind/blog/issues/107)
