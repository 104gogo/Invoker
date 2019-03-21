# promise 源码跟踪

### 代码
下面列出一些 promise 的使用方式，然后源码角度看看为什么是这样。

##### Promise & resolve
```javascript
const wait = time => new Promise(resolve => setTimeout(resolve, time));

Promise.resolve().then(() => console.log('立即打印'));
Promise.resolve(wait(2000)).then(() => console.log('等待了2秒之后打印'));
```

##### Promise & reject
```javascript
Promise.reject(100).then(undefined, v => v).then(v => console.log(v))
```

##### then 的回调函数
```javascript
doSomething().then(function () {
  return doSomethingElse();
}).then((data) => {
  console.log(data);
})；
```

```javascript
doSomethin().then(functiuoin () {
  doSomethingElse();
}).then((data) => {
  console.log(data);
});
```

```javascript
doSomething().then(doSomethingElse()).then((data) => {
  console.log(data);
});
```

```javascript
doSomething().then(doSomethingElse);.then((data) => {
  console.log(data);
});
```



##### 异常处理
```javascript

```

### 参考
[从一道Promise执行顺序的题目看Promise实现](https://zhuanlan.zhihu.com/p/34421918)
