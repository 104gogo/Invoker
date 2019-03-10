# React16 事件源码分析加长版

@(react)


### 介绍
可以在 React 官网上看到有关事件的[介绍](https://reactjs.org/docs/events.html)，提取下关键点：
- SyntheticEvent（合成事件），这个事件对象可以做到跨平台支持所有浏览器，并且和原生事件对象提供的接口一致
- 事件池，SyntheticEvent 对象是放在事件池中的，在事件回调完成之后，会被回收再利用，所以不要将它在异步中使用

### 事件委托
给每个子节点绑定事件的坏处：
- ajax 局部刷新的盛行，导致每次加载完，都要重新绑定事件
- 部分浏览器移除元素时，绑定的事件并没有被及时移除，导致的内存泄漏，严重影响性能
- 绑定事件越多，浏览器内存占用越大，严重影响性能
- 绑定事件是直接和 dom 进行交互的，访问 dom 是一个十分浪费性能的事情

所以将事件委托给父节点，只需要操作一次 dom，极大的减少 js 与 dom 的交互，减少内存，新增和移除的元素也能很好的进行控制。

### 流程

#### 初始化
引入 react-dom
```javascript
import ReactDOM from 'react-dom';
```
执行 react-dom/src/client/ReactDOM.js
```javascript
// react-dom/src/client/ReactDOM.js
import type {ReactNodeList} from 'shared/ReactTypes';
// TODO: This type is shared between the reconciler and ReactDOM, but will
// eventually be lifted out to the renderer.
import type {
  FiberRoot,
  Batch as FiberRootBatch,
} from 'react-reconciler/src/ReactFiberRoot';
import type {Container} from './ReactDOMHostConfig';

import '../shared/checkReact';
import './ReactDOMClientInjection'; // 接下来是这里
...
```
执行 react-dom/src/client/ReactDOMClientInjection.js 文件，将5个事件插件进行初始化，并且在 events/EventPluginRegistry.js 文件中，将插件数据进行预处理，得到`plugins`,`registrationNameDependencies`等全局配置，供后面使用
```javascript
// react-dom/src/client/ReactDOMClientInjection.js
...
import BeforeInputEventPlugin from '../events/BeforeInputEventPlugin';
import ChangeEventPlugin from '../events/ChangeEventPlugin';
import DOMEventPluginOrder from '../events/DOMEventPluginOrder';
import EnterLeaveEventPlugin from '../events/EnterLeaveEventPlugin';
import SelectEventPlugin from '../events/SelectEventPlugin';
import SimpleEventPlugin from '../events/SimpleEventPlugin';
...
/**
 * Some important event plugins included by default (without having to require
 * them).
 */
EventPluginHubInjection.injectEventPluginsByName({
  SimpleEventPlugin: SimpleEventPlugin,
  EnterLeaveEventPlugin: EnterLeaveEventPlugin,
  ChangeEventPlugin: ChangeEventPlugin,
  SelectEventPlugin: SelectEventPlugin,
  BeforeInputEventPlugin: BeforeInputEventPlugin,
});
```

#### 事件注册
React 是通过事件委托机制，将大部分的 eventType 绑定在 document 上，使用 addEventListener 方法，通过统一的 listener 方法进行事件分发和处理
```javascript
document.addEventListener(eventType, listener, false);
```

接下来分析源码，首先看  react-dom/src/client/ReactDOMComponent.js 这个文件在`diffHydratedProperties`,`setInitialDOMProperties`,`diffProperties`等方法中会触发事件的注册`ensureListeningTo`方法，然后将大部分事件绑定在 **document** 上面
```javascript
// react-dom/src/client/ReactDOMComponent.js
...
function ensureListeningTo(rootContainerElement, registrationName) {
  const isDocumentOrFragment =
    rootContainerElement.nodeType === DOCUMENT_NODE ||
    rootContainerElement.nodeType === DOCUMENT_FRAGMENT_NODE;

  // 这里获取到 document
  const doc = isDocumentOrFragment
    ? rootContainerElement
    : rootContainerElement.ownerDocument;
  listenTo(registrationName, doc); // 接下来是这里
}
...
```
react-dom/src/events/ReactBrowserEventEmitter.js，接下来重点看下`listenTo`方法
其中`registrationNameDependencies` 在上面的注册的过程中有提到过，它的数据结构如下：
```javascript
{
	onAbort: ["abort"],
	onAbortCapture: ["abort"],
	onAnimationEnd: ["animationend"],
	onAnimationEndCapture: ["animationend"],
	onAnimationIteration: ["animationiteration"],
	onAnimationIterationCapture: ["animationiteration"],
	onAnimationStart: ["animationstart"],
	onAnimationStartCapture: ["animationstart"],
	onAuxClick: ["auxclick"],
	onAuxClickCapture: ["auxclick"],
	onBeforeInput: (4) ["compositionend", "keypress", "textInput", "paste"],
	onBeforeInputCapture: (4) ["compositionend", "keypress", "textInput", "paste"],
	...
}
```
```javascript
// react-dom/src/events/ReactBrowserEventEmitter.js
export function listenTo(
  registrationName: string,
  mountAt: Document | Element,
) {
  // isListening 最开始是个空对象，用来检测 document 上是否已经监听 dependency 事件，即同一类型事件只会绑定一次
  const isListening = getListeningForDocument(mountAt);
  
  const dependencies = registrationNameDependencies[registrationName];
  // 对 TOP_SCROLL，TOP_FOCUS，TOP_BLUR 等事件做兼容处理，在事件的捕获阶段进行监听，其他是在默认处理，在事件的冒泡阶段进行监听
  for (let i = 0; i < dependencies.length; i++) {
    const dependency = dependencies[i];
    if (!(isListening.hasOwnProperty(dependency) && isListening[dependency])) {
      switch (dependency) {
        case TOP_SCROLL:
          trapCapturedEvent(TOP_SCROLL, mountAt);
          break;
        case TOP_FOCUS:
        case TOP_BLUR:
          trapCapturedEvent(TOP_FOCUS, mountAt);
          trapCapturedEvent(TOP_BLUR, mountAt);
          // We set the flag for a single dependency later in this function,
          // but this ensures we mark both as attached rather than just one.
          isListening[TOP_BLUR] = true;
          isListening[TOP_FOCUS] = true;
          break;
        case TOP_CANCEL:
        case TOP_CLOSE:
          if (isEventSupported(getRawEventName(dependency))) {
            trapCapturedEvent(dependency, mountAt);
          }
          break;
        case TOP_INVALID:
        case TOP_SUBMIT:
        case TOP_RESET:
          // We listen to them on the target DOM elements.
          // Some of them bubble so we don't want them to fire twice.
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
      // 最后把 dependency 标记为已注册过，防止重复注册
      isListening[dependency] = true;
    }
  }
}
```
trapBubbledEvent 方法是在 react-dom/src/events/ReactDOMEventListener.js 文件中，其中`dispatch`方法就是事件回调的统一入口
```javascript
// react-dom/src/events/ReactDOMEventListener.js
export function trapBubbledEvent(
  topLevelType: DOMTopLevelEventType,
  element: Document | Element,
) {
  if (!element) {
    return null;
  }
  // dispatch 方法就是事件回调的统一入口
  const dispatch = isInteractiveTopLevelEventType(topLevelType)
    ? dispatchInteractiveEvent
    : dispatchEvent;

  addEventBubbleListener( // 接下来是这里
    element,
    getRawEventName(topLevelType),
    // Check if interactive and wrap in interactiveUpdates
    dispatch.bind(null, topLevelType),
  );
}
```
在 react-dom/src/events/EventListener.js 文件中，可以看到实际的事件注册还是使用的原生`addEventListener`方法，这里的 element 就是上面传下来的 document，**所以 React 事件的本质还是使用事件代理的方式**，将所有的事件都注册在了 document 元素上面，并且通过 listener 进行统一的分发。这里的 listener 就是上面的 dispatch 方法，即：dispatchEvent
```javascript
// react-dom/src/events/EventListener.js
export function addEventBubbleListener(
  element: Document | Element,
  eventType: string,
  listener: Function,
): void {
  element.addEventListener(eventType, listener, false); // 冒泡阶段
}

export function addEventCaptureListener(
  element: Document | Element,
  eventType: string,
  listener: Function,
): void {
  element.addEventListener(eventType, listener, true); // 捕获阶段
}
```
#### 事件触发和执行
1. 获取 SyntheticEvent 合成事件对象 event
2. 模拟事件捕获和冒泡，并且获取每个阶段里面对应事件在组件上面绑定的 listener 回调方法，存在放在 event._dispatchListeners 数组中
3. 最后依次执行 event._dispatchListeners 中的 listener 方法，然后重置 event 对象

还是在 react-dom/src/events/ReactDOMEventListener.js 文件中
```javascript
// react-dom/src/events/ReactDOMEventListener.js
export function dispatchEvent(
  topLevelType: DOMTopLevelEventType,
  nativeEvent: AnyNativeEvent,
) {
  ...
  const bookKeeping = getTopLevelCallbackBookKeeping(
    topLevelType,
    nativeEvent,
    targetInst,
  );

  try {
    // Event queue being processed in the same cycle allows
    // `preventDefault`.
    batchedUpdates(handleTopLevel, bookKeeping); // 这里会进入到 handleTopLevel 方法
  } finally {
    releaseTopLevelCallbackBookKeeping(bookKeeping);
  }
}
```
 handleTopLevel 方法中 bookKeeping 对象的意图不是很清楚，但是从`runExtractedEventsInBatch`方法开始，就进入到了正题
```javascript
// react-dom/src/events/ReactDOMEventListener.js
function handleTopLevel(bookKeeping) {
  ...
  for (let i = 0; i < bookKeeping.ancestors.length; i++) {
    targetInst = bookKeeping.ancestors[i];
    runExtractedEventsInBatch( // 接下来是这里
      bookKeeping.topLevelType,
      targetInst,
      bookKeeping.nativeEvent,
      getEventTarget(bookKeeping.nativeEvent),
    );
  }
}
```
进入到 events/EventPluginHub.js 文件，这个文件中每个方法都比较重要
首先是`runExtractedEventsInBatch` 方法，它主要是通过原生事件对象，获取到合成事件对象，然后对事件监听的 listener 方法进行执行
```javascript
// events/EventPluginHub.js
export function runExtractedEventsInBatch(
  topLevelType: TopLevelType,
  targetInst: null | Fiber,
  nativeEvent: AnyNativeEvent,
  nativeEventTarget: EventTarget,
) {
  // 获取合成事件对象
  const events = extractEvents(
    topLevelType,
    targetInst,
    nativeEvent,
    nativeEventTarget,
  );
  // 执行 events._dispatchListeners 中的事件回调方法
  runEventsInBatch(events);
}
```
接下来看看 extractEvents 方法，其中`plugins` 在上面的注册的过程中有提到过，它的数据结构如下：
```javascript
[
  null,
  {
    eventTypes: {blur: {…}, cancel: {…}, click: {…}, close: {…}, contextMenu: {…}, …},
    extractEvents: ƒ (topLevelType, targetInst, nativeEvent, nativeEventTarget),
    isInteractiveTopLevelEventType: ƒ (topLevelType),
  },
  {eventTypes: {…}, extractEvents: ƒ},
  {eventTypes: {…}, _isInputEventSupported: true, extractEvents: ƒ},
  {eventTypes: {…}, extractEvents: ƒ},
  {eventTypes: {…}, extractEvents: ƒ},
]
```
对插件数组进行循环，topLevelType 类型如果在对应插件中找到了到了话，就会从它的事件池中返回合成事件对象
```javascript
// events/EventPluginHub.js
function extractEvents(
  topLevelType: TopLevelType,
  targetInst: null | Fiber,
  nativeEvent: AnyNativeEvent,
  nativeEventTarget: EventTarget,
): Array<ReactSyntheticEvent> | ReactSyntheticEvent | null {
  let events = null;
  for (let i = 0; i < plugins.length; i++) {
    // Not every plugin in the ordering may be loaded at runtime.
    const possiblePlugin: PluginModule<AnyNativeEvent> = plugins[i];
    if (possiblePlugin) {
	  // 这里获取到的事件对象已经获得了事件捕获和冒泡上面所以的 listener 
      const extractedEvents = possiblePlugin.extractEvents( // 下面进入这里
        topLevelType,
        targetInst,
        nativeEvent,
        nativeEventTarget,
      );
      if (extractedEvents) {
        events = accumulateInto(events, extractedEvents);
      }
    }
  }
  return events;
}
```
我们从5个插件中选一个来看看内部做了什么
```javascript
// react-dom/src/events/SimpleEventPlugin.js
const SimpleEventPlugin: PluginModule<MouseEvent> & {
  isInteractiveTopLevelEventType: (topLevelType: TopLevelType) => boolean,
} = {
  ...
  extractEvents: function(
    topLevelType: TopLevelType,
    targetInst: null | Fiber,
    nativeEvent: MouseEvent,
    nativeEventTarget: EventTarget,
  ): null | ReactSyntheticEvent {
    const dispatchConfig = topLevelEventsToDispatchConfig[topLevelType];
    ...
    let EventConstructor;
    // 对事件进行兼容处理
    switch (topLevelType) {
      case DOMTopLevelEventTypes.TOP_KEY_PRESS:
        // Firefox creates a keypress event for function keys too. This removes
        // the unwanted keypress events. Enter is however both printable and
        // non-printable. One would expect Tab to be as well (but it isn't).
        if (getEventCharCode(nativeEvent) === 0) {
          return null;
        }
      /* falls through */
      case DOMTopLevelEventTypes.TOP_KEY_DOWN:
      case DOMTopLevelEventTypes.TOP_KEY_UP:
        EventConstructor = SyntheticKeyboardEvent;
        break;
      ...
    }
    const event = EventConstructor.getPooled( // 从事件池中获取事件对象
      dispatchConfig,
      targetInst,
      nativeEvent,
      nativeEventTarget,
    );
    accumulateTwoPhaseDispatches(event); // 获取当前事件捕获和冒泡监听的 listener
    return event;
  }
}
```
我们看看 React 事件中捕获和冒泡的实现，首先从当前节点进行回溯，将路径上的节点存在 path 数组中，然后通过反向和正向遍历一次，模拟捕获和冒泡的过程
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
上面的 fn 其实是 accumulateDirectionalDispatches 方法，它主要是获取当前节点上面的 lintener ，这里的 listener 就是我们组件上面自定义的回调方法，然后存放到event._dispatchListeners 中，可以发现 _dispatchListeners 数组中的顺序刚好是事件捕获和冒泡的顺序
```javascript
// events/EventPropagators.js
function accumulateDirectionalDispatches(inst, phase, event) {
  if (__DEV__) {
    warningWithoutStack(inst, 'Dispatching inst must not be null');
  }
  // 从当前组件上获取 props 上面的对应事件的回调方法
  const listener = listenerAtPhase(inst, event, phase);
  if (listener) {
    event._dispatchListeners = accumulateInto(
      event._dispatchListeners,
      listener,
    );
    event._dispatchInstances = accumulateInto(event._dispatchInstances, inst);
  }
}
```
我们看看具体是怎么获取组件上面的事件方法的，registrationName 是具体的事件名，如：'onClick' 等
```javascript
// events/EventPluginHub.js
export function getListener(inst: Fiber, registrationName: string) {
  let listener;

  // TODO: shouldPreventMouseEvent is DOM-specific and definitely should not
  // live here; needs to be moved to a better place soon
  const stateNode = inst.stateNode;
  if (!stateNode) {
    // Work in progress (ex: onload events in incremental mode).
    return null;
  }
  const props = getFiberCurrentPropsFromNode(stateNode);
  if (!props) {
    // Work in progress.
    return null;
  }
  // 这里看到就很亲切了，获取我们在组件上自定义的方法
  listener = props[registrationName];
  ...
  return listener;
}
```
这样我们在回到`runExtractedEventsInBatch`方法，去执行所有的 lisnter，啊，终于完了。等等，我们再看看事件传递的阻止是怎么做的。在对 dispatchListeners 进行循环执行的时候，如果在 listener 中执行了`e.stopPropagation`方法，就会停止循环。循环完之后，event 对象就会进行重置，回收工作。
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

### 局限
当然，事件委托也是有一定局限性的

比如 focus、blur 之类的事件本身没有事件冒泡机制，所以无法委托；

mousemove、mouseout 这样的事件，虽然有事件冒泡，但是只能不断通过位置去计算定位，对性能消耗高，因此也是不适合于事件委托的

以后再仔细看看，React 是怎么处理的。

### 参考文档
这些文档都是 React 15 的源码分析

[React 事件机制 (不完全总结)](https://juejin.im/entry/58d138a344d9040069175574)
[React 事件系统分析与最佳实践](https://zhuanlan.zhihu.com/p/27132447)
[揭秘React形成合成事件的过程](https://segmentfault.com/a/1190000013363525)
[一看就晕的React事件机制](https://segmentfault.com/a/1190000013364457#articleHeader3)
[React源码解读系列 – 事件机制](http://zhenhua-lee.github.io/react/react-event.html)