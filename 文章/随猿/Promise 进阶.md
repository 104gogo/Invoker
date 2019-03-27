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

## 分解 Promise 的执行步骤
目前我们最常使用的是 [es6-promise](https://github.com/stefanpenner/es6-promise)，经常会作为 polyfill 被引入，但它的源码相对复杂，不太适合入门，所以选择 [lie](https://github.com/calvinmetcalf/lie) 库来学习下 Promises/A+ spec (Version 1.1) 的实现，提供可以测试的 [demo](https://github.com/104gogo/Invoker/tree/master/packages/promise) 项目，需要 clone 之后安装运行。等我们看完全文，理解了 Promise 的基本运行原理之后，再回去看 es6-promise 就会比较轻松了～

#### promise 对象的属性
下面列出 promise 很重要的3个属性
```javascript
this.state = PENDING; // 状态
this.queue = []; // callback 队列
this.outcome = void 0; // 记录当前的值，即 callback 的参数
```
生成 promise 的情况有：
- new Promise()
- Promise.resolve()
- Promise.reject()
- then()

#### then 方法做了些什么事情？
下面是 then 方法的源码，注释中的 promiseA 表示调用 then 方法的 this 值，promiseB 表示新创建的 promise。
```javascript
Promise.prototype.then = function (onFulfilled, onRejected) {
  // 判断 callback 是不是函数，如果不是函数，但是状态已经改变了，就返回 promiseA
  if (typeof onFulfilled !== 'function' && this.state === FULFILLED ||
    typeof onRejected !== 'function' && this.state === REJECTED) {
    return this;
  }
   
  // 创建新的 promiseB
  var promise = new this.constructor(INTERNAL);

  // 看当前 promiseA 的状态，如果不是 PENDING，就通过 unwrap 方法将 callback 和 promiseB 放到微循环队列中，等待执行，否则，将 callback 和 promiseB 放在 promiseA 的队列中。这里很关键，起到了前后 promise 连接的作用。
  if (this.state !== PENDING) {
    var resolver = this.state === FULFILLED ? onFulfilled : onRejected;
    unwrap(promise, resolver, this.outcome);
  } else {
    this.queue.push(new QueueItem(promise, onFulfilled, onRejected));
  }

  // 返回 promiseB
  return promise;
};
```
可以看到 then 方法最后返回了一个新的 promise 对象。那是不是每次执行 then 方法之后得到的 promise 和前面的不一样？并且新返回的 promise 状态是 PENDING 的，带着疑问我们测试一下这种情况。
```javascript
var doSomething = v => console.log(v);
var promise1 = Promise.resolve(1);
var promise2 = promise1.then(v => v + 2);
var promise3 = promise2.then(v => v + 3);
var promise4 = promise3.then(doSomething); // 6

console.log(promise1 === promise2); // false
console.log(promise2 === promise3); // false
console.log(promise3 === promise4); // false
```
以前一直以为同级别的 then 方法的 callback 会放在最开始那个 promise.queue 数组中，现在看了源码，我们知道了它们其实是分别放在多个 promise 里面的。

我们接着对上面的测试代码进行分析。这段代码在`同步执行完成之后`（即 callback 还没有执行之前），promise1 到 promise4 的数据结构如下：
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

#### callback 是怎么连续执行的？
从上面知道 callback 是异步执行的，因为 callback 最后都会进入到微循环队列中，等到同步代码执行之后再执行，也就是说 promise.queue 数组只是暂存一下 callback，等到一定条件也会进入到微循环队列。

这里是通过 unwrap 方法将 callback 放到了微循环队列中（到底怎么放进去的，这里就不讲了，最下面的参考文章中会对微任务进行详细分析，感兴趣的同学可以去看看）。  
unwrap 的参数如下：
- promise 是前面介绍 then 方法的时候，在里面新创建的那个 promiseB
- func 是 callback
- value 是前面介绍 then 方法中那个 promiseA 的 value
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
    handlers.resolve(promise, returnValue);
  });
}
```
执行 callback 之后，就可以拿到返回值。

在 handlers.resolve 中，我们可以通过 promiseB 对象，在它的 queue 里面，找到下一个 promiseC 和对应的 callback 继续执行。
```javascript
handlers.resolve = function (self, value) {
  // 当 value 是 promise 的时候，获取它的 then 方法，否则 thenable 为 undefined
  var result = tryCatch(getThen, value);
  if (result.status === 'error') {
    return handlers.reject(self, result.value);
  }
  var thenable = result.value;

  // 这里 value 不是 promsie，所有 thenable 为 undefined。value 为 promise 的情况后面再分析
  if (thenable) {
    safelyResolveThenable(self, thenable);
  } else {
    self.state = FULFILLED;
    self.outcome = value;
    var i = -1;
    var len = self.queue.length;
    // 遍历 promiseB.queue，从而找到下一个 promiseC
    while (++i < len) {
      self.queue[i].callFulfilled(value);
    }
  }
  return self;
};
```
`self.queue[i].callFulfilled(value)` 执行的源码大致如下：
```javascript
function callFulfilled(value) {
  unwrap(this.promise, this.onFulfilled, value);
};
```
this.promise 是下一个 promise（promiseC），this.onFulfilled 是下一个 callback。这样又进入到了微循环队列中，等待执行。

到这里大家可能看的比较累了，我们先回顾一下，简单 promise 代码的执行顺序（对，你没有看错，目前分析的是比较简单情况，value 为 promise 这样比较复杂的代码，还没有分析，所以我们需要继续努力！）。

因为 resolve 方法在最开始就同步执行了，所以第一个 then 里面的 callback，直接进入到了微循环队列中，并且 promise2 作为 promise 链的起始值，如下：
```javascript
unwrap(promise2, v => v + 2, 1)
```
当所有同步代码执行完之后，刚才放入微循环队列中的第一个 callback 就会立即执行，通过`handlers.resolve`中前后 promise 的联系，找到下一个 callback，又放入微循环队列，从而执行完所有的 callback。
```javascript
callback(1) // 返回值为 3
handlers.resolve(promise2, 3)

unwrap(promise3, v => v + 3, 3)
// 将 callback 放入微循环队列中等待执行
callback(3) // 返回值为 6
handlers.resolve(promise3, 6)

unwrap(promise4, doSomething, 6)
// 将 callback 放入微循环队列中等待执行
callback(6) // 没有返回值
handlers.resolve(promise4, undefined)

// promise4.queue 为空，执行结束
```
同步的代码在 callback 执行之前就执行完了，后面所有的 callback 会等到前一个 callback 执行之后，再进入到微任务队列中，但其实等待的时间很短，几乎可以忽略。

#### 当 value 是 promise 的时候
上面的代码比较简单，就像你委托别人做一件事情，别人做好了之后，你就可以接着往下做。
但现实中，可能是你委托了 A，A 又委托了 B，B 又委托了 C 和 D 这样复杂的情况。你需要做的是等到 A 告诉你结果，然后再继续往下工作。这就是 value 为 promise 的意义。

我们写个稍微复杂一点的例子，将 Promise 进行了嵌套，让 promise 对象作为 callback 的返回值。
```javascript
var doSomething = v => console.log(v);

var doSomethingElse = (v) => {
  var promise21 = Promise.resolve(v);
  var promise22 = promise21.then((v) => {
    var promise31 = Promise.resolve(v);
    var promise32 = promise31.then(v => v + 1);
    return promise32;
  });
  var promise23 = promise22.then(v => v + 3);

  return promise23;
};

var promise11 = Promise.resolve(1);
var promise12 = promise11.then(doSomethingElse);
var promise13 = promise12.then(doSomething); // 5
```

按照前面的思路，我们先看看各个 promise 的数据结构。

最外层的 promise 如下：
```javascript
const promise11 = {
  state: 'FULFILLED',
  outcome: 1,
  queue: [], // doSomethingElse 直接放到了微循环队列中
};

const promise12 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [{ promise: promise13, onFulfilled: doSomething }],
};

const promise13 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [],
};
```
第二层的 promise 如下：
```javascript
const promise21 = {
  state: 'FULFILLED',
  outcome: 1,
  queue: [], // callback 直接放到了微循环队列中
};

const promise22 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [{ promise: promise23, onFulfilled: v => v + 3 }],
};

const promise23 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [{ promise: promise24, onFulfilled: value => handlers.resolve(promise12, value) }], // 重点
};
```
第三层的 promise 如下：
```javascript
const promise31 = {
  state: 'FULFILLED',
  outcome: 1,
  queue: [], // v => v + 1 直接放到了微循环队列中
};

const promise32 = {
  state: 'PENDING',
  outcome: undefined,
  queue: [{ promise: promise33, onFulfilled: value => handlers.resolve(promise22, value) }], // 重点
};
```
上面标了“重点”的地方可以看到，promise23 连接的是上一层的 promise12，promise32 连接的是上一层的 promise22。**因为这样的一个种顺序，所以外面的 callback 会等里面的 callback 执行完之后再执行，并且能获取到内部 promise 的结果**。接着我们看看这是怎么做到的。

继续模拟代码执行顺序
```javascript
unwrap(promise12, doSomethingElse, 1)
```
当同步代码执行完时，微循环队列中的第一个 callback 就会立即执行
```javascript
callback(1) // 返回值为 promise23
handlers.resolve(promise12, promise23)
safelyResolveThenable(promise12, promise23.then); // 这里就和前面不一样了
...
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
    thenable(onSuccess, onError); // 重点
  }

  var result = tryCatch(tryToUnwrap);
  if (result.status === 'error') {
    onError(result.value);
  }
}
```
safelyResolveThenable 方法看起来很长，其实它的作用就是将一个 promise 放在另一个 promise 的 then 方法中并执行，即上面的 promise12 放到 promise23 的 then 方法中，如下：
```javascript
var promise24 = promise23.then(value => {
  ...
  handlers.resolve(promise12, value); // 这行代码就很熟悉了
});
```
promise32 和 promise22 的连接如下：
```javascript
var promise33 = promise32.then(value => {
  ...
  handlers.resolve(promise22, value);
});
```
这样我们可以得到一个 promise 的顺序链：
```javascript
promise11 -> promise21 -> promise31 -> promise32 -> promise22 -> promise23 -> promise12 -> promise13
```
ok，大家可以调试看看，不过执行顺序可能会比较绕，需要有点耐心。reject 和 resolve 是差不多的，希望大家能举一反三，这里就不继续介绍了。

## 总结
这篇文章主要是中源码层面对 Promise 的执行顺序进行了简单的分析，主要需要了解下面2点

- Promise 整体包含4大块，执行顺序是从 Promise 构造函数，到 Promise 构造函数的回调函数，到 then 方法，最后到 then 方法的 callback。callback 是异步执行的。
- callback 的返回值是 promise 的话，会中断后续 then 方法的执行，直到返回的 promise 状态改变才会接着执行

## 参考
[从一道Promise执行顺序的题目看Promise实现](https://zhuanlan.zhihu.com/p/34421918)  
这篇文章中讲解了微任务的实现原理，感兴趣的同学可以阅读一下。
