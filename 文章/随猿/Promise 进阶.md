# Promise 进阶

@(promise)

## Promise 整体执行顺序
Promise 的执行顺序，大致如下：
- 首先执行 Promise 构造函数
- 然后是 Promise 构造函数的回调函数
- 接下来是**依次执行若干 then 方法**
- 最后是 then 方法的回调函数（后面 then 方法中的回调函数都用 `callback` 指代）

示例代码：
```javascript
var doSomething = v => console.log(v);
new Promise(resolve => {
  doSomething(1);
  resolve(3);
})
.then(doSomething)
.then(doSomething(2));
```
执行结果为：
```
1
2
3
```
可以看到前面三步是同步执行，只有 `callback 是异步执行`的。

## 分解 promise 的执行步骤
目前我们最常使用的是 [es6-promise](https://github.com/stefanpenner/es6-promise)，经常会作为 polyfill 被引入，但它的源码相对复杂，不太适合入门，所以我们通过 [lie](https://github.com/calvinmetcalf/lie) 库来学习下， Promises/A+ spec (Version 1.1) 的实现，给出[测试地址](https://github.com/104gogo/Invoker/tree/master/packages/promise)。理解了 Promise 的基本运行原理，再回去看 es6-promise 就会比较轻松了～

#### promise 对象的属性
```javascript
this.state = PENDING; // 状态
this.queue = []; // callback 队列
this.outcome = void 0; // 记录当前的值，即 callback 的参数
```
#### then 方法做了些什么事情？
下面是 then 方法的源码
```javascript
Promise.prototype.then = function (onFulfilled, onRejected) {
  // 判断两个参数是不是函数，如果都不是函数就中断后续处理
  if (typeof onFulfilled !== 'function' && this.state === FULFILLED ||
    typeof onRejected !== 'function' && this.state === REJECTED) {
    return this;
  }
  var promise = new this.constructor(INTERNAL);

  // 看当前 promise 的状态，如果不是 PENDING，就将 callback 放到微循环队列中，等待执行，否则，将 callback 放在当前 promise 的队列中
  if (this.state !== PENDING) {
    var resolver = this.state === FULFILLED ? onFulfilled : onRejected;
    unwrap(promise, resolver, this.outcome);
  } else {
    this.queue.push(new QueueItem(promise, onFulfilled, onRejected));
  }

  // 放回一个新的 promise 对象。下面会分析它的意义
  return promise;
};
```
可以看到 then 方法最后返回了一个新的 promise 对象。那是不是每次执行 then 方法之后得到的 promise 和前面的不一样？并且新返回的 promise 状态是 PENDING 的，带着疑问我们测试一下。
```javascript
var doSomething = v => console.log(v);
var promise1 = Promise.resolve(1);
var promise2 = promise1.then(v => v + 2);
var promise3 = promise2.then(v => v + 3);
var promise4 = promise3.then(doSomething);

console.log(promise1 === promise2); // false
console.log(promise2 === promise3); // false
console.log(promise3 === promise4); // false
```
以前一直以为同级别的 then 方法的 callback 会放在最开始那个 promise.queue 数组中，现在看了源码，我们知道了它们其实是放在多个 promise 里面的。

上面代码，在同步执行完成之后（即 callback 还没有执行之前）的数据结构如下：
```javascript
const promise1 = {
  state: 'FULFILLED', // 状态是'FULFILLED'
  outcome: 1,
  queue: [], // callback：v => v + 2，直接放到了微循环队列中
};

const promise2 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [{ promise: promise3, onFulfilled: v => v + 3 }],
};

const promise3 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [{ promise: promise4, onFulfilled: doSomething }],
};

const promise4 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [],
};
```
在所有 then 方法执行之后，callback 方法执行之前，我们得到了这样4个 promise 对象。可以看出，**then 方法最主要的作用就是缓存 callback**。

#### value 是怎么在 callback 中传递的？
我们从上面知道 callback 是异步执行的，因为 callback 最后都会进入到微循环队列中，等到同步代码执行之后再执行，也就是说 promise.queue 数组只是暂存一下 callback，等到一定条件也会进入到微循环队列。

这里是通过 unwrap 方法将 callback 放到了微循环队列中。unwrap 的参数如下：
- promise 是 then 方法新创建的
- func 是 callback
- value 是上一个 promise 的 value
```javascript
function unwrap(promise, func, value) {
  immediate(function () {
    var returnValue;
    try {
      returnValue = func(value); // 执行 callback
    } catch (e) {
      return handlers.reject(promise, e);
    }
    
    ...
    handlers.resolve(promise, returnValue); // 拿到返回值，通过当前 promise 对象，找到下一个 promsie 进行处理
  });
}
```
handlers.resolve 方法起到了连接上下 promise 的作用。拿到返回值，通过当前 promise 对象，找到下一个 promsie 进行处理。
```javascript
handlers.resolve = function (self, value) {
  var result = tryCatch(getThen, value);
  if (result.status === 'error') {
    return handlers.reject(self, result.value);
  }
  var thenable = result.value;

  // 判断 value 的类型
  if (thenable) {
    safelyResolveThenable(self, thenable);
  } else {
    self.state = FULFILLED;
    self.outcome = value;
    var i = -1;
    var len = self.queue.length;
    // 遍历 promise.queue
    while (++i < len) {
      self.queue[i].callFulfilled(value);
    }
  }
  return self;
};
```
callFulfilled 方法的内容如下，this.promise 是下一个 promise，this.onFulfilled 是下一个 callback。
```javascript
function callFulfilled(value) {
  unwrap(this.promise, this.onFulfilled, value);
};
```
这样就将 value 传到了下一个 promise 的 queue callback 里面。

到这里大家可能看的比较累了，我们先总结下，简单 promise 代码的执行顺序（对！你没有看错，value 为 promise 这样比较复杂的情况，我们还需要继续努力）。
```javascript
// 执行第一个 then 方法，当前 promise 的状态不是 'PENDING'
unwrap(promise2, v => v + 2, 1)
// 将 callback 放入微循环队列中等待执行
callback(1)
handlers.resolve(promise2, 3)

unwrap(promise3, v => v + 3, 3)
// 将 callback 放入微循环队列中等待执行
callback(3)
handlers.resolve(promise3, 6)

unwrap(promise4, doSomething, 6)
// 将 callback 放入微循环队列中等待执行
callback(6)
handlers.resolve(promise4, undefined)

// promise4.queue 为空，执行结束
```
同步的代码其实在 callback 执行之前就执行完了，所以后面所有的 callback 会依次进入到微任务队列中，但其实等待的时间很短，几乎可以忽略。

#### value 是个 promise
上面的代码就像你委托别人做一件事情，别人做好了之后，你才能接着往下做。

但现实中，可能是你委托了A，A又委托了B，B又委托了C和D。你需要做的就是等到A告诉你结果，然后你再继续往下工作。这就是 value 为 promise 的意义。

我们新写个例子，将 Promise 进行了嵌套，让 promise 对象作为 callback 的返回值。
```javascript
var doSomething = v => console.log(v);
var doSomethingElse = v => {
  doSomething(v);
  var promise4 = new Promise(resolve => {
    setTimeout(() => resolve(v), 1000);
  });
  var promise5 = promise4.then(v => v + 2);
  return promise5; // 返回 promise 对象
};

var promise1 = new Promise(resolve => {
  setTimeout(() => resolve(1), 1000);
});
var promise2 = promise1.then(doSomethingElse)
var promise3 = promise2.then(doSomething);
```

上面代码，在同步执行完成之后（即 callback 还没有执行之前）的数据结构如下：
```javascript
const promise1 = {
  state: 'PENDING', // resolve 方法在 setTimeout 中，所以状态还是初始值
  outcome: undefined,
  queue: [{ promise: promise2, onFulfilled: doSomethingElse }],
};

const promise2 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [{ promise: promise3, onFulfilled: doSomething }],
};

const promise3 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [],
};
```
同步代码执行完了，等待 setTimeout 回调函数触发，执行 resolve 方法。
```javascript
handlers.resolve(promise1, 1)
unwrap(promise1, doSomethingElse, 1)
// 将 callback 放入微循环队列中等待执行
callback(1)

handlers.resolve(promise1, promise5)
safelyResolveThenable(promise1, promise5.then); // 这里就和前面不一样了
```

我们看看 safelyResolveThenable 方法的源码
```javascript
function safelyResolveThenable(self, thenable) {
  // Either fulfill, reject or reject with error
  var called = false;
  function onError(value) {
    if (called) {
      return;
    }
    called = true;
    handlers.reject(self, value);
  }

  function onSuccess(value) {
    if (called) {
      return;
    }
    called = true;
    handlers.resolve(self, value);
  }

  function tryToUnwrap() {
    thenable(onSuccess, onError);
  }

  var result = tryCatch(tryToUnwrap);
  if (result.status === 'error') {
    onError(result.value);
  }
}
```
safelyResolveThenable 方法的作用是将 promise1 放到 promise5 的 then 方法中，达到获取 promise5 的 value 的作用。上面的代码相当于：
```javascript
promise5.then(value => {
  ...
  handlers.resolve(promise1, value); // 这行代码就很熟悉了
});
```
此时 promise4 和 promise5 的数据结构如下：
```javascript
const promise4 = {
  state: 'PENDING', // resolve 方法在 setTimeout 中，所以状态还是初始值
  outcome: undefined,
  queue: [{ promise: promise5, onFulfilled: v => v + 2 }],
};

const promise5 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [{ promise: promise6, onFulfilled: value => handlers.resolve(promise1, value) }],
};

const promise6 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [],
};
```
这样 promise5 的 value 传给 promise1，然后 promise1 有去遍历 queue，执行 promise2...

## 总结
- then 的返回值是一个新的 promise 对象
- 同层级的 promise 对象通过，queue 中的对象连接起来
- value 不是 promise 的时候，可以直接传给下一个 callback
- value 是 promise 的时候，当前的 promise 会被嵌套在返回的 promise.then 中

## 参考
[从一道Promise执行顺序的题目看Promise实现](https://zhuanlan.zhihu.com/p/34421918)
