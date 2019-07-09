# call, apply, bind 进阶

## 缘起
一切是从 babel 转译 es6 Class 的代码开始的，其中转换出来的代码，有一段大概是下面这个样子的，它看上去难以理解，所以有了后面的研究。
```javascript
(self = function() {}).call.apply(self, [this, ...args]);
```

要讲清楚上面的代码，我们需要回忆一下模拟 call 和 apply 的原理，主要是利用在对象上面挂载的函数，里面的 this 就指向此对象的特性。
```javascript
var bar = function() {
  console.log(this.value)
};

var foo = {
  value: 1,
  bar,
};

foo.bar(); // 相当于 bar.call(foo);
```

call 和 apply 的模拟实现如下：
```javascript
Function.prototype.apply = function (context, arr) {
  var context = Object(context) || window;
  context.fn = this;

  var result;
  if (!arr) {
      result = context.fn();
  }
  else {
      var args = [];
      for (var i = 0, len = arr.length; i < len; i++) {
          args.push('arr[' + i + ']');
      }
      result = eval('context.fn(' + args + ')')
  }

  delete context.fn
  return result;
}

Function.prototype.call = function (context) {
  var context = context || window;
  context.fn = this;

  var args = [];
  for(var i = 1, len = arguments.length; i < len; i++) {
      args.push('arguments[' + i + ']');
  }

  var result = eval('context.fn(' + args +')');

  delete context.fn
  return result;
}
```
call 和 apply 的模拟实现几乎一模一样，只是传递的参数不同。都是在传入对象上面添加 fn 属性，组装参数，最后执行 this。

还不是很明白的同学，可以先看看[这里](https://github.com/mqyqingfeng/Blog/issues/11)。

## call 和 apply 的链式调用
有了基础概念之后，我们回到最开始的代码来对它进行分析。
```javascript
// 将它进行转换，看看最后真正执行的代码是什么
(self = function() {}).call.apply(self, [this, ...args]);

// 相当于执行下面的代码
self.call(this, ...args);

// 相当于执行下面的代码
this.self(...args);
```
看最后变形出来的代码，你会发现一个很神奇的现象，就是最后的代码是由最开始的参数组成的（self，this 和 args）。这是不是有什么规律呢？我们再多写几个 call 和 apply 试试。

以代码`X.X.X.X.apply.call.apply(Function, args)`为例，我们捋一捋它的执行流程。前方高能，友情提示：务必注意 call 或 apply 模拟函数的 this 是什么，context 又是什么。

1. 首先执行最后一个 apply
2. 然后进入 apply 的模拟代码，此时 **this 是 X.X.X.X.apply.call，context 是 Function**
3. 执行到`eval('context.fn(' + args + ')');` 相当于 `eval('this(' + args + ')');` 相当于 `eval('X.X.X.X.apply.call(' + args + ')');`
4. 这里执行 call。为什么执行 call ?不是因为原表达式 apply 前面是 call 所以执行它，而是因为 apply 模拟函数里面的 this 是它，所以接下来执行 call
5. 接着进入 call 的模拟代码，此时 **this 是 Function，context 是 this**，这里一定要理解！！
6. 然后执行到`eval('context.fn(' + args + ')');` 相当于 `eval('this(' + args + ')');` 相当于 `eval('Function(' + args + ')');`
7. 最后执行 Function，此时 Function 里面的 this **就指向最开始的那个 this 参数**。另外需要注意，Function 的参数是最开始参数去掉 2 个之后剩下的参数
8. done

这里对 call 和 apply 的链式调用，总结一下：
- 链式调用最多执行两次（apply或者call，没有先后顺序）就返回结果，更多的不会执行
- X.X.X.call.apply(Function, args)，X.X.X 写的再长，其实并不起作用，最后都是执行 Function，即第一个参数务必是一个函数
- args 会从左到右依次减一，因为 call 或 apply 每次执行要消耗一个，剩下的继续作为参数

给一个可以运行的代码：
```javascript
[].concat.call.apply(Array, [{}, 2, 3])
```

## 加入 bind 的链式调用
我们再看看下面的代码，它的作用是生成一个平铺一层数组的函数。
```javascript
Function.apply.bind([].concat, [])
```
表面上看每个单词你可能都认识，但是合在一起就会有种打脑壳的感觉。这样的代码该怎么看呢？我们需要先将它剥茧抽丝，翻译成能看的懂的代码，过程就像如下一样：
```javascript
// 相当于
function (...args) {
  return Function.apply.call([].concat, [], args)
}

// 相当于
function (...args) {
  return [].concat.apply([], args)
}

// 相当于
function (...args) {
  return [].concat(...args)
}
```
其实根据我们上面总结的规律，看到`Function.apply.call([].concat, [], args)`这行代码的时候，就能知道它的结果是`[].concat(...args)`了。

总结一下 
首先你需要一秒反应过来，bind 执行后的代码是什么样子的，其实是有规律的，记住如下两点
1. 返回一个函数，可以接受参数
2. 函数里面是，将原表达式的 bind 换成 call 的一个新的表达式。意思是：`Function.apply.bind([].concat, [])` -> `Function.apply.call([].concat, [], args)`

然后 apply.call 的链式调用就可以按照上面的结论，瞬间看出结果。

## 思考
我们如果仔细观察的话，会发现一个细节和 [bind 规范](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_objects/Function/bind#Polyfill)实现不一样的地方，就是我们通常手写 bind 模拟代码的时候用的是 apply，如下：
```javascript
fBound  = function() {
  baseArgs.length = baseArgsLength;
  baseArgs.push.apply(baseArgs, arguments);
  return fToBind.apply( // 这里是用的 apply
    fNOP.prototype.isPrototypeOf(this) ? this : otherThis, baseArgs
  );
};
```
那为什么我们上面转换出来的代码是 call ?（如果是 apply 的话，上面那个代码运行不了）

