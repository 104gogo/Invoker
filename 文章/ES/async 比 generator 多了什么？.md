# async 比 generator 多了什么？

### 父子？
async 和 generator 在使用的方式几乎一样（可能是因为在 dva 里面用多了，产生了这样的错觉）。其实它们的可比性不大，但是为了避免产生上面的错觉，所以记录一下它们原生有什么不同。下面是它们最主要的区别：

- 写法不同，await 和 yield，async 和 *
- async 可以自执行，generator 需要调用自身迭代器接口 next 方法，不然会一直等待着

### 从代码看看区别

##### await 可以赋值，而 yield 不能
```javascript
async function foo() {
  const a = await '1';
  console.log(a); // '1'
}

foo();
```
```javascript
function *foo() {
  const a = yield '1';
  console.log(a); // undefined
}

const gen = foo();
gen.next();
gen.next();
```
上面代码中 generator 函数输出 a 为 undefined 的原因如下：
> Generator 函数从暂停状态到恢复运行，它的上下文状态（context）是不变的。通过`next`方法的参数，就有办法在 Generator 函数开始运行之后，继续向函数体内部注入值。也就是说，可以在 Generator 函数运行的不同阶段，从外部向内部注入不同的值，从而调整函数行为 - [next 方法的参数](http://es6.ruanyifeng.com/#docs/generator#next-%E6%96%B9%E6%B3%95%E7%9A%84%E5%8F%82%E6%95%B0)

意思是，next 方法的参数会被注入到 generator 函数中，作为 yield 的返回值。在上面的代码中，我们没有给 next 方法传入任何值，自然被转成了 undefined，所以 a 也就是 undefined。如果我们给第一个 next 方法传个'3'进去，可以看到输出就是'3'了。

##### yield 右边的数据去哪儿了？
我们可能在 yield 右边写了很多处理逻辑，然后需要它的结果继续进行处理，却消失在了茫茫代码中。。

不要慌，我们知道迭代器的数据都是通过`next() { return { value: '...', done: false } }`的 value 值获取的，所以将上面的代码改一下，就可以看到数据了。
```javascript
const gen = foo();
console.log(gen.next().value); // '1'
```

### generator 实现 async 的功能

##### 让 yield 也能赋值
我们知道 next 方法可以注入数据到函数中，是不是将 value 注入进去就好了。
```javascript
function *foo() {
  const a = yield '1';
  console.log(a); // '1'
  const b = yield '2';
  console.log(b); // '2'
}

const gen = foo();
let info;
info = gen.next();
info = gen.next(info.value);
info = gen.next(info.value);
```

##### value 是 promise 的处理
当 yield 右边是一个 promise 对象的时候，我们期望能获取到这个 promise 的结果（异步操作的结果）作为 value 值，如果没有结束的话会一直等在这里，异步操作结束再执行 next(value)，然后运行下一个代码片段，直到遇到 yield 才停止运行。这样就可以让异步代码，看起来像是同步代码一样的，没有回调函数和代码嵌套。

我们在下面的代码添加一个 wait 方法，让它返回一个 promise 对象，然后通过`Promise.resolve()`来等待 promise 的结果，再执行 next 方法。
```javascript
const wait = value => new Promise(resolve => setTimeout(() => resolve(value), 2000));
function *foo() {
  const a = yield wait('1');
  console.log(a); // '1'
  const b = yield '2';
  console.log(b); // '2'
}

const gen = foo();
let info;
info = gen.next();
info = Promise.resolve(info.value).then(value => gen.next(value)); // 使用Promise.resolve()等待promise的结果
info = gen.next(info.value);
```
上面的代码并没有得到我们期望的效果，因为 then 是异步的，会先执行最后一行的代码，所以我们需要让最后一个 next 方法也在 promise 链中，才能保证执行的顺序。下面我们再将 foo 中的代码改一下，并且将迭代器对象放在 promise 链中执行。
```javascript
const wait = value => new Promise(resolve => setTimeout(() => resolve(value), 2000));
function *foo() {
  const a = yield wait('1');
  console.log(a); // 等2s，显示 '1'
  const b = yield wait('2');
  console.log(b); // 等2s，显示 '2'
}

const gen = foo();
let info;
info = gen.next();
info = Promise.resolve(info.value).then(value => {
  info = gen.next(value);
  Promise.resolve(info.value).then(value => {
    info = gen.next(value);
  });
});
```
可以看到代码按照期望运行了，但是如果我们写了很多 yield，同样需要写很多 next 方法来执行它，如果能让 promise 链自动生成，像 async 一样自动执行就好了。

##### generator 方法自执行的实现
我们先回忆下上面的辛路历程。要让 generator 正常运行需要些什么步骤：
- 生成迭代器对象
- 执行 next 方法，将上一个 next 的 value 值，作为下一个 next 的参数
- 如果 value 是一个 promise 对象，就要延迟执行 next 方法，获取到新的 value 值之后，一直`递归`当前这一步
- 直到 done 为 true 的时候，结束递归

我们实现一个 run 方法，让 generator 方法自执行
```javascript
function run(cb) {
  const gen = cb();

  function auto(value) {
    const info = gen.next(value);
    if (info.done) {
      return;
    }

    Promise.resolve(info.value).then(value => auto(value));
  }

  auto();
}

const wait = value => new Promise(resolve => setTimeout(() => resolve(value), 2000));

run(function* () {
  const a = yield wait('1');
  console.log(a); // 等2s，显示 '1'
  const b = yield wait('2');
  console.log(b); // 等2s，显示 '2'
});
```

##### async 函数的返回值是个 promise 对象
async 函数返回的 promise 对象，会在内部所有的 yield 运行结束（包括异步执行）之后，才会 resolve。我们的 run 方法也需要这样的特性。
```javascript
function run(cb) {
  const gen = cb();

  return new Promise((resolve) => {
    function auto(value) {
      const info = gen.next(value);

      if (info.done) {
        resolve(info.value);
        return;
      }

      Promise.resolve(info.value).then(value => auto(value));
    }

    auto();
  });
}

const wait = value => new Promise(resolve => setTimeout(() => resolve(value), 2000));

run(function* () {
  const a = yield wait('1');
  console.log(a); // 等2s，显示 '1'
  const b = yield wait('2');
  console.log(b); // 等2s，显示 '2'
}).then(() => console.log('3')); // '3'
```
##### 异常处理
我们继续改进 run 方法，要像 async 函数一样，可以在内部或者外部捕获到异常，就像下面这样：
```javascript
const getData = () => Promise.reject(new Error('error'));

run(function* () {
  try {
    yield getData();
  } catch (e) {
    console.log('内部捕获:', e.message); // 内部捕获: error
  }
  yield getData();
  console.log('end'); // 不输出
}).catch((e) => console.log('外部捕获:', e.message)); // 外部捕获: error
```
顺带提一下 Promise  reject 需要注意的地方，根据 Promise/A+ 规范的 2.2.7 小节：
> then() 方法的第二个参数 onRejected 只有返回一个 rejected promise 或者抛出异常时，then() 返回的 promise 才会变为 rejected 状态，否则返回的 promise 是 resolved。

举个例子：
```
Promise.reject(100).then(undefined, v => v).then(v => console.log(v))
// 输出 100
```
所以，`Promise.resolve(info.value).then(onResolve, onReject);`需要补上 reject 的处理，让错误信息可以传下去。

然后使用`gen.throw`方法将外部的错误，抛到 generator 内部，让内部可以捕获到错误信息，从而继续执行。

如果内部没有捕获的话，异常又会被抛到 gen.throw，我们需要在这里 try catch 住，将异常信息传递给最外面的 reject 方法，让外部可以捕获到异常，并且中断 generator 函数的执行。
```diff
function run(cb) {
  const gen = cb();
- return new Promise((resolve) => {
+ return new Promise((resolve, reject) => {
-    function auto(value) {
-      const info = gen.next(value);
+    function auto(value, key) {
+      try {
+        const info = gen[key](value);
+      } catch (e) {
+        reject(e);
+        return;
+      }

      if (info.done) {
        resolve(info.value);
        return;
      }

-     Promise.resolve(info.value).then(value => auto(value));
+     Promise.resolve(info.value).then(value => auto(value, 'next'), value => auto(value, 'throw'));
    }

-   auto();    
+   auto(undefined 'next');
  });
}
```
完整示例代码如下：
```javascript
function run(cb) {
  const gen = cb();

  return new Promise((resolve, reject) => {
    function auto(value, key) {
      let info;
      try {
        info = gen[key](value);
      } catch (e) {
        reject(e);
        return;
      }

      if (info.done) {
        resolve(info.value);
        return;
      }

      Promise.resolve(info.value).then(value => auto(value, 'next'), value => auto(value, 'throw'));
    }

    auto(undefined, 'next');
  });
}

const wait = value => new Promise(resolve => setTimeout(() => resolve(value), 2000));

// run(function* () {
//   const a = yield wait('1');
//   console.log(a); // 等2s，显示 '1'
//   const b = yield wait('2');
//   console.log(b); // 等2s，显示 '2'
// }).then(() => console.log('3'));

const getData = () => Promise.reject(Error('error'));

run(function* () {
  try {
    yield getData();
  } catch (e) {
    console.log('内部捕获:', e.message);
  }
  yield getData();
  console.log('end');
}).catch((e) => console.log('外部捕获:', e.message));

```
