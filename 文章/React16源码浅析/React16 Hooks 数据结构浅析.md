# React16 Hooks 数据结构浅析

@(react16.8)

## Hooks 的数据结构
在 react-reconciler/src/ReactFiberHooks.js 文件，我们会发现特别重要的3个类型定义，Update、UpdateQueue 和 Hook。它们记录了如下信息：
- hooks 的顺序，即组件代码中 useXXX 的执行顺序，**切记 useXXX 和 Hook 没有一一对应的关系**
- hook 的 state，state 比较好理解，就是我们要的状态值
- 每次 dispatch 执行的 action。dispatch 是 setXXX 方法，传给它的回调函数就是 action

### Update
Update 是一个链表结构，它主要记录了当前的 action 和 state。它的类型定义如下：
```javascript
type Update<S, A> = {
  expirationTime: ExpirationTime,
  action: A, // 用户自定义的方法或值，如：c => c + 1
  eagerReducer: ((S, A) => S) | null, // 执行 action 的方法
  eagerState: S | null, // 执行 action 之后的状态值
  next: Update<S, A> | null, // 下一个 Update，形成链表
};
```

hooks 处理的时候将它做成了一个**循环链表**的结构。以下面的代码为例：
```javascript
const handleClick = () => {
  setCount(c => c + 1);
  setCount(c => c + 2);
  setCount(c => c + 3);
};
```
我们获得到的 update 链的数据结构如下：
```javascript
const update = {
  action: c => c + 1,
  eagerState: 1,
  next: {
    action: c => c + 2,
    eagerState: undefined,
    next: {
      action: c => c + 3,
      eagerState: undefined,
      next: { // 这里又回到了第一个
        action: c => c + 1,
        eagerState: 1,
        next: ...
      }
    },
  },
};
```

造成这样的代码如下：
```javascript
// react-reconciler/src/ReactFiberHooks.js
function dispatchAction<S, A>(
  fiber: Fiber,
  queue: UpdateQueue<S, A>,
  action: A,
) {
  ...
    const update: Update<S, A> = {
      expirationTime,
      action,
      eagerReducer: null,
      eagerState: null,
      next: null,
    };

    // Append the update to the end of the list.
    const last = queue.last; // queue 会在下面介绍
    if (last === null) {
      // This is the first update. Create a circular list.
      update.next = update;
    } else {
      const first = last.next;
      if (first !== null) {
        // Still circular.
        update.next = first;
      }
      last.next = update;
    }
    queue.last = update;
  ...
}
```

### UpdateQueue
上面 React 源码中的 queue 就是 UpdateQueue，它和 Update 组合起来有点像小时候玩的“滚铁环”的游戏，环是 Update 组成的循环链表，相信这点大家没有什么问题。手上拿的棒子就是 UpdateQueue，为什么这样说呢？当我们想要遍历这个链表的时候，需要找到一个点作为入口，这个点就保存在 UpdateQueue 上面的，即：last。

UpdateQueue 的类型定义如下：
```javascript
type UpdateQueue<S, A> = {
  last: Update<S, A> | null, // 最后一个 Update
  dispatch: (A => mixed) | null, // 上面源码中的 dispatchAction 函数
  lastRenderedReducer: ((S, A) => S) | null, // 上一次渲染之后的 reducer 
  lastRenderedState: S | null, // 上一次渲染之后的状态值
};
```
我们知道，this.setState 在 React Event handler 中执行的时候是批处理的，hooks 的 dispatch（即：setCount） 方法也不例外。所以 lastRenderedReducer 和 lastRenderedState 是一次批处理完成之后的数据。

为了方便查看，将上面的代码复制过来。
```javascript
const handleClick = () => {
  setCount(c => c + 1);
  setCount(c => c + 2);
  setCount(c => c + 3);
};
```
然后我们看看 UpdateQueue 的数据结构是什么样的。
```javascript
const queue = {
  last: { action: c => c + 3, ... }
  dispatch: dispatchAction
  lastRenderedReducer: basicStateReducer 
  lastRenderedState: 6
};
```

### Hook
Hook 主要是记录了当前 hook 的 state 值。它的类型定义如下：
```javascript
export type Hook = {
  memoizedState: any, // 最新的状态值

  baseState: any,
  baseUpdate: Update<any, any> | null, // 等于 queue.last
  queue: UpdateQueue<any, any> | null, // UpdateQueue

  next: Hook | null, // 下一个Hook，形成链表
};
```

React Hooks 在初始化的时候，会形成 Hook 组成的链表，源码如下：
```javascript
function mountWorkInProgressHook(): Hook {
  const hook: Hook = {
    memoizedState: null,

    baseState: null,
    queue: null,
    baseUpdate: null,

    next: null,
  };

  if (workInProgressHook === null) {
    // This is the first hook in the list
    firstWorkInProgressHook = workInProgressHook = hook;
  } else {
    // Append to the end of the list
    workInProgressHook = workInProgressHook.next = hook;
  }
  return workInProgressHook;
}
```
firstWorkInProgressHook 和 workInProgressHook 是模块内部的全局变量，firstWorkInProgressHook 保存的是第一个 Hook，workInProgressHook 是最后一个 Hook，

然后我们看看重新执行组件的时候，hook 是怎么获取到最新的状态值。
```javascript
function updateWorkInProgressHook(): Hook {
  ...
    // There's already a work-in-progress. Reuse it.
    workInProgressHook = nextWorkInProgressHook;
    nextWorkInProgressHook = workInProgressHook.next;

    currentHook = nextCurrentHook;
    nextCurrentHook = currentHook !== null ? currentHook.next : null;
  ...
}
```

可以看到，这个 Hook 链是按照，useXXX 使用顺序生成的，如果某个 useXXX 没有执行，那么取出来的 hook，就会出问题。