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
(self = function() {}).call.apply(self, [this, ...args]);

// 相当于执行下面的代码
self.call(this, ...args);

// 相当于执行下面的代码
this.self(..args);
```
看最后变形出来的代码，你会发现一个很神奇的现象就是，最后的代码是由最开始的参数组成的。这是不是有什么规律呢？对，我们再添加几个 call 和 apply 试试。

以代码`X.X.X.X.apply.call.apply(Function, args)`为例，捋一捋它的执行流程，前方高能，友情提示：务必注意 call 或 apply 模拟函数的 this 是什么，context 又是什么。

1. 先执行最后一个 apply
2. 然后进入 apply 的模拟代码，此时：**this 是 X.X.X.X.apply.call，context 是 Function**
3. 执行到`eval('context.fn(' + args + ')');` 变为 `eval('this(' + args + ')');` 变为 `eval('X.X.X.X.apply.call(' + args + ')');`
5. 这里执行 call。注意不是因为 apply 后面跟的 call 所以执行它，而是因为 apply 里面的 this 是它
6. 接着进入 call 的模拟代码，又是执行 eval('context.fn(' + args + ')');
7. 变为：eval('this(' + args + ')');
8. 再变为：eval('(' + args + ')');
8. 重点！！！ 这里的 this 是 Function，而不是下一个 apply，所以这里终止了后面的链式调用
9. 最后的执行结果就是 Function(resetArgs)，resetArgs 是被消耗2个剩下的参数

### 结论
1. 最多执行两次（apply或者call，没有先后顺序）就返回结果，更多的不会执行
2. X.X.X.call.apply(Function, args)，X.X.X 写的再长，其实并不起作用，最后都是执行 Function
3. args 会从左到右依次减一，因为 call 或 apply 每次执行要消耗一个，剩下的继续作为参数