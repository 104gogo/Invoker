# React16 事件源码分析简化版

@(react)

### 问题
1. 为什么不允许在原生 js 中使用循环添加事件，但是在 React 中使用循环添加事件却是理所当然？
2. 在使用 Select 组件的时候，它的 onChange 方法是事件代理吗？


### 源码片段
对一些关键点进行分析

#### 事件绑定

##### Document
React 是将大部分的事件绑定在 Document 上面的
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
  // 这里的 doc 就是 document
  listenTo(registrationName, doc);
}
```
[Node.ownerDocument](https://developer.mozilla.org/zh-CN/docs/Web/API/Node/ownerDocument) 只读属性会返回当前节点的顶层的 document 对象

并且每个事件只绑定一次，所以不像原生事件，同一个节点上一个事件可以绑定多个回调。处理方法如下：
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
      ...
      isListening[dependency] = true; // 这里记录监听了的 dependency 事件
    }
  }
}
```

哪些事件不是绑定在此的？

##### 事件真实绑定
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
element：就是上面说的 document
addEventListener：对不同的事件，进行捕获或冒泡的处理
listener： 统一的事件处理方法

#### 事件处理
React 的事件中一共有5个事件插件，它们分别对不同类型的事件做处理，然后返回接口统一的合成事件对象

##### 事件池
对于频繁触发的事件，事件插件中都使用了事件池，我们看看其中的一个事件插件
```javascript
// react-dom/src/events/SimpleEventPlugin.js
const SimpleEventPlugin: PluginModule<MouseEvent> & {
  isInteractiveTopLevelEventType: (topLevelType: TopLevelType) => boolean,
} = {
  extractEvents: function(
    topLevelType: TopLevelType,
    targetInst: null | Fiber,
    nativeEvent: MouseEvent,
    nativeEventTarget: EventTarget,
  ): null | ReactSyntheticEvent {
    const dispatchConfig = topLevelEventsToDispatchConfig[topLevelType];
    if (!dispatchConfig) {
      return null;
    }
    let EventConstructor;
    switch (topLevelType) {
      ...
      case DOMTopLevelEventTypes.TOP_BLUR:
      case DOMTopLevelEventTypes.TOP_FOCUS:
        EventConstructor = SyntheticFocusEvent;
        break;
      ...
      default:
        ...
        // HTML Events
        // @see http://www.w3.org/TR/html5/index.html#events-0
        EventConstructor = SyntheticEvent; // 默认的合成事件对象构造函数
        break;
    }
    // 从事件池中取合成事件对象
    const event = EventConstructor.getPooled(
      dispatchConfig,
      targetInst,
      nativeEvent,
      nativeEventTarget,
    );
    // 获取捕获和冒泡中的事件队列，存在 event._dispatchListeners 数组中
    accumulateTwoPhaseDispatches(event);
    return event;
  },
};
```

##### 模拟捕获和冒泡
```javascript
// shared/ReactTreeTraversal.js
export function traverseTwoPhase(inst, fn, arg) {
  const path = [];
  while (inst) {
    path.push(inst);
    inst = getParent(inst);
  }
  let i;
  for (i = path.length; i-- > 0; ) {
    fn(path[i], 'captured', arg);
  }
  for (i = 0; i < path.length; i++) {
    fn(path[i], 'bubbled', arg);
  }
}
```

##### 获取组件上的事件
```javascript
// events/EventPluginHub.js
export function getListener(inst: Fiber, registrationName: string) {
  let listener;
  // live here; needs to be moved to a better place soon
  const stateNode = inst.stateNode;

  const props = getFiberCurrentPropsFromNode(stateNode);
  
  listener = props[registrationName]; // 获取组件 props 上定义的事件
  
  return listener;
}
```

##### 事件执行
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
可以看到这里除了执行 event._dispatchListeners 中的事件，还对事件的传递进行了阻止的处理，所以 react 中的事件阻止是和原生的不一样的。

### 解答
为什么不允许在原生 js 中使用循环添加事件，但是在 React 中使用循环添加事件却是理所当然？
因为 React 内部使用事件代理

在使用 Select 组件的时候，它的 onChange 方法是事件代理吗？
不是。

### 参考文档

[React 事件代理与 stopImmediatePropagation](https://github.com/youngwind/blog/issues/107)
