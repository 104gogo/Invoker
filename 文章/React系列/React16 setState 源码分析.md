# React16 setState 源码分析

@(react)

先抛出问题，下面代码的输出结果为什么是这样？
```javascript
import React from 'react';
import ReactDOM from 'react-dom';

class Count extends React.Component {
  state = { count: 1 };

  handleClick = () => {
    this.setState({ count: this.state.count + 1 });
    this.setState({ count: this.state.count + 1 });
    console.log(this.state.count); // 1

    setTimeout(() => {
      this.setState({ count: this.state.count + 1 });
      console.log(this.state.count); // 3
      this.setState({ count: this.state.count + 1 });
      console.log(this.state.count); // 4
    }, 0);
  };

  render() {
    const { count } = this.state;

    return (
      <>
        <div>{count}</div> // count 最后显示 4
        <button onClick={this.handleClick}>点我</button>
      </>
    );
  }
}

ReactDOM.render((
  <Count />
), document.getElementById('root'));
```
现象：
1. setState 在事件回调中表现为异步，在 setTimeout 中表现为同步。
2. 注释 setTimeout 后执行，页面上显示为2。看起来像是只执行了一个 setState 方法。

结论：
1. 在事件回调函数或者生命周期函数中，它们会调 batchedUpdates 方法，将 isBatchingUpdates 设置为 true，让当前要执行的函数处于批处理状态中。然后 setState 执行到 requestWork 方法，就会被 isBatchingUpdates 给中断。而 setTimout 并没有调 batchedUpdates 方法，所以它的每个 setState 都顺利执行了，并且每次都更新了 this.state.count。

2. 当多个 setState 在批处理状态中执行时，会被依次放入 updateQueue 链表中，然后在 beginWork 调用生命周期方法 getDerivedStateFromProps 之前，生成最新的 state。


#### setState 做了些什么
setState 主要是将用户设置的状态或者回调函数，存在当前组件的 Fiber 对象的 updateQueue 属性上，它是一个链表结构。

这是链表追加的一段代码：
```javascript
function appendUpdateToQueue(queue, update) {
  // Append the update to the end of the list.
  if (queue.lastUpdate === null) {
    // Queue is empty
    queue.firstUpdate = queue.lastUpdate = update;
  } else {
    queue.lastUpdate.next = update;
    queue.lastUpdate = update;
  }
}
```

执行前两个 setState 之后，updateQueue 的数据结构如下：
```javascript
{
	baseState: {count: 1}， // 当前状态
	firstUpdate: {
		payload: { count: 2 }, // 第一个 setState 传入的状态
		expirationTime: 1073741823,
		next: {
			payload: { count: 2 }, // 第二个 setState 传入的状态
			expirationTime: 1073741823,
			next: {
				payload: { count: 2 },
				next: null,
			},
		},
	},
	lastUpdate: {
		expirationTime: 1073741823,
		payload: { "count": 2 },
		callback: null,
		next: null,
		nextEffect: null
	},
	...
}
```

#### 如何从状态链表（updateQueue）中获取新的状态
在运行 getDerivedStateFromProps 之前，会计算出新的 state。

运行 getStateFromUpdate 方法，循环遍历 updateQueue，每次循环会将前一个状态和新的状态通过`Object.assign({}, prevState, partialState)`的方式进行合并。
```javascript
function getStateFromUpdate<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
  update: Update<State>,
  prevState: State,
  nextProps: any,
  instance: any,
): any {
  switch (update.tag) {
    ...
    // Intentional fallthrough
    case UpdateState: {
      const payload = update.payload;
      let partialState;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
          if (
            debugRenderPhaseSideEffects ||
            (debugRenderPhaseSideEffectsForStrictMode &&
              workInProgress.mode & StrictMode)
          ) {
            payload.call(instance, prevState, nextProps);
          }
        }
        partialState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          exitDisallowedContextReadInDEV();
        }
      } else {
        // Partial state object
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        return prevState;
      }
      // Merge the partial state and the previous state.
      return Object.assign({}, prevState, partialState); // 重点，状态合并
    }
    ...
  }
  return prevState;
}

export function processUpdateQueue<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
  props: any,
  instance: any,
  renderExpirationTime: ExpirationTime,
): void {
  ...
  // Iterate through the list of updates to compute the result.
  let update = queue.firstUpdate;
  let resultState = newBaseState;
  while (update !== null) {
    ...
      // a new result.
      resultState = getStateFromUpdate(
        workInProgress,
        queue,
        update,
        resultState,
        props,
        instance,
      );
      ...
    }
    // Continue to the next update.
    update = update.next;
  }
  
  queue.baseState = newBaseState;
  queue.firstUpdate = newFirstUpdate;
  queue.firstCapturedUpdate = newFirstCapturedUpdate;
  ...
  workInProgress.memoizedState = resultState;
}
```

#### isBatchingUpdates 的作用
isBatchingUpdates 如果为 true，执行多个 setState，每个 setState 传入的状态都会被暂存到 updateQueue 中，形成上面的链式结构，直到批处理完成（即：isBatchingUpdates = false），才会从 updateQueue 中取出状态，进行上面的合并操作。

requestWork 方法会在 performWork 之前做一下拦截，看看当前是否是在渲染中，或者是在批处理中，是的话就直接 return，如果不是的话，才进入到真正的渲染阶段。
```javascript
// requestWork is called by the scheduler whenever a root receives an update.
// It's up to the renderer to call renderRoot at some point in the future.
function requestWork(root: FiberRoot, expirationTime: ExpirationTime) {
  addRootToSchedule(root, expirationTime);
  if (isRendering) {
    // Prevent reentrancy. Remaining work will be scheduled at the end of
    // the currently rendering batch.
    return;
  }

  if (isBatchingUpdates) { // 重点
    ...
    return;
  }

  // TODO: Get rid of Sync and use current time?
  if (expirationTime === Sync) {
    performSyncWork();
  } else {
    scheduleCallbackWithExpirationTime(root, expirationTime);
  }
}
```

#### 在哪里将 isBatchingUpdates 设置为 true
通过《React 事件源码分析》我们知道，事件回调的统一入口是 dispatchEvent，这里会将 isBatchingUpdates 设置为 true。
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
当事件触发，运行 dispatchEvent 方法，会对事件进行批处理
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
从而设置`isBatchingUpdates = true`
```javascript
function batchedUpdates<A, R>(fn: (a: A) => R, a: A): R {
  const previousIsBatchingUpdates = isBatchingUpdates;
  isBatchingUpdates = true;
  try {
    return fn(a);
  } finally {
    isBatchingUpdates = previousIsBatchingUpdates;
    if (!isBatchingUpdates && !isRendering) {
      performSyncWork();
    }
  }
}
```

#### 还有哪些函数会让 setState 看起来是异步执行的
React 自身实现的一些方法：componentWillMount，componentDidMount，Event handler 等。将最上面的示例代码改造如下，想想输出结果会是什么。
```javascript
import React from 'react';
import ReactDOM from 'react-dom';

class Count extends React.Component {
  state = { count: 1 };

  componentWillMount() {
    this.setState({ count: this.state.count + 2 });
    this.setState({ count: this.state.count + 1 });
    console.log('componentWillMount: ', this.state.count);
  }

  componentDidMount() {
    this.setState({ count: this.state.count + 2 });
    this.setState({ count: this.state.count + 1 });
    console.log('componentDidMount: ', this.state.count);
  }

  handleClick = () => {
    this.setState({ count: this.state.count + 2 });
    this.setState({ count: this.state.count + 1 });
    console.log('handleClick: ', this.state.count);

    setTimeout(() => {
      this.setState({ count: this.state.count + 2 });
      console.log('setTimeout1: ', this.state.count);
      this.setState({ count: this.state.count + 1 });
      console.log('setTimeout2: ', this.state.count);
    }, 0);
  };

  render() {
    const { count } = this.state;

    return (
      <>
        <div>{count}</div>
        <button onClick={this.handleClick}>点我</button>
      </>
    );
  }
}

ReactDOM.render((
  <Count />
), document.getElementById('root'));
```
![setState](https://github.com/mqyqingfeng/Blog/raw/master/Images/throttle/throttle1.gif)



