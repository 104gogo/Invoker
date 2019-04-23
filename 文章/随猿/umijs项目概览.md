# umi 项目分析

@(umi)


## 介绍
[umi](https://github.com/umijs/umi)库是20个 packages 的集合体，它包含：
- af-webpack
- babel-preset-umi
- eslint-config-umi
- umi
- umi-core
- umi-library
- umi-mock
- umi-build-dev
- umi-plugin-auto-externals
- umi-plugin-dll
- umi-plugin-dva
- umi-plugin-hd
- umi-plugin-locale
- umi-plugin-ployfills
- umi-plugin-react
- umi-plugin-routes
- umi-serve
- umi-test
- umi-types
- umi-utils

## packages 的管理
开发这么多的包，管理起来无疑是非常痛苦的，幸运的是有 lerna 可以使用，后面再深入了解下。

## packages 的关系

### 核心
umi、umi-core、umi-build-dev、af-webpack、umi-plugin-react
 
### 插件
umi-plugin-auto-externals、umi-plugin-dll、umi-plugin-dva、umi-plugin-hd、umi-plugin-locale、umi-plugin-ployfills、umi-plugin-react、umi-plugin-routes

### 工具
umi-utils

### 测试
umi-test

### babel
babel-preset-umi

### eslint
eslint-config-umi

---

## 核心包介绍

### umi
整个项目的入口，因为 bin/umi.js 是定义在这里的，我们执行的命令也是从这里开始的。
这个包主要提供了命令调用入口，包含 dev，build，test 等命令，一些路由的组件和一些工具方法。

#### 命令
常用命令。
```javascript
// umi/src/cli.js
...
switch (script) {
  case 'build':
  case 'dev':
  case 'test':
  case 'inspect':
    require(`./scripts/${script}`);
    break;
  default: {
    const Service = require('umi-build-dev/lib/Service').default;
    new Service(buildDevOpts(args)).run(aliasMap[script] || script, args);
    break;
  }
}
```
build 命令的源码如下，发现它是交给 umi-build-dev 这个包进行处理的。
```javascript
// umi/src/scripts/build.js
import yParser from 'yargs-parser';
import buildDevOpts from '../buildDevOpts';

process.env.NODE_ENV = 'production';

const args = yParser(process.argv.slice(2));
const Service = require('umi-build-dev/lib/Service').default;
new Service(buildDevOpts(args)).run('build', args);
```

#### 路由组件
```
import Link from 'umi/link';
import NavLink from 'umi/navlink';
import Redirect from 'umi/redirect';
import withRouter from 'umi/withRouter';
```

#### 其他
```
import dynamic from 'umi/dynamic';
import babel from 'umi/babel';
```

### umi-build-dev
这个包非常关键。在 umi 包执行命令的时候，都初始化了一个它的`Service`类，并且执行了**run**方法。

初始化：
- 获取用户的配置，.umirc.js 或 config/config.js
- 获取插件（plugins），包含内置插件（builtInPlugins）和用户自定义的插件（userPlugins）
  - 将每个插件转换成如下格式的对象，包含 id、apply 和 opts。这样从 Function[] 转换成了 Object[]
  ```javascript
  const apply = require(p); // eslint-disable-line
  return {
      id: p.replace(/^.\//, 'built-in:'),
      // id: path.replace(makesureLastSlash(cwd), 'user:'),
      apply: apply.default || apply,
      opts,
   };
   ```
- 获取内置的路径对象

run 方法执行顺序如下：
- 载入用户定义的环境变量
- 运行（初始化）所有插件，具体做的事情如下：
  - 创建 api 对象，`const api = new Proxy(new PluginAPI(id, this), {})`。这样 api 包含了所有插件内部操作方法，如：chainWebpackConfig、addEntryImport、`registerCommand` 等
  - 执行插件对象中的 apply 方法，**这里就执行了所有的插件**
  - 插件函数里面的 api 方法也会跟着执行，将具体要执行的内容，暂存在`service.pluginHooks`中，源码如下：
    ```javascript
    // umi-build-dev/src/PluginAPI.js
    register(hook, fn) {
	    const { pluginHooks } = this.service;
	    pluginHooks[hook] = pluginHooks[hook] || [];
	    // pluginHooks 是个二维数组，hook 表示 api 上面的某个方法，fn 是用户要执行的函数
	    pluginHooks[hook].push({
	      fn,
	    });
	  }
	  
	  registerMethod(name, opts) {
	    this.service.pluginMethods[name] = (...args) => {
	      if (apply) {
	        this.register(name, opts => {
	          return apply(opts, ...args);
	        });
	      }
	      ...
	    };
	  }
    ```
- 运行 runCommand 方法，执行对应的命令
  -  插件初始化的时候，会执行内置的几个命令插件如下，这样就可以执行对应命令了
  ```javascript
  // 内置插件
  const builtInPlugins = [
    './plugins/commands/dev',
    './plugins/commands/build',
    './plugins/commands/inspect',
    './plugins/commands/test',
    './plugins/commands/help',
    './plugins/commands/generate',
    './plugins/commands/rm',
    './plugins/commands/config',
    './plugins/commands/block',
    ...
  ];
  ```

umi 的插件功能非常强大，连内部的命令都是通过插件注册的。有兴趣可以看看插件开发的文章。
[umi 插件开发入门](https://github.com/frontend9/fe9-library/issues/50)
[官方插件开发](https://umijs.org/plugin/develop.html#%E5%88%9D%E5%A7%8B%E5%8C%96%E6%8F%92%E4%BB%B6)

#### 常用的 commands 介绍
从上面我们可以看到，**plugins/commands** 中包含 dev、build、generate 和 test 等命令。

##### umi dev
- 获取路由信息
- 设置 NODE_ENV = development
- 执行 onStartAsync 异步插件，下面的内容在异步完成之后执行
- 通过模版生成配置文件。模版文件在`umi-build-dev/template`目录下
  - 生成路由的配置文件 router.js。umi 是约定式路由，路由配置文件通过文件夹结构来生成
  - 生成入口文件 entry.js
  - 生成 history.js 文件
- 给 service 添加更多的方法，restart、rebuildTmpFiles、rebuildHTML等，待后面使用
- 执行 _beforeDevServerAsync 内部插件，如：dll 这样的配置先运行
- 最后，af-webpack/dev 运行，启动 webpack-dev-server

##### umi build
- 设置 NODE_ENV = production
- 执行 onStartAsync 异步插件，下面的内容在异步完成之后执行
- 通过模版生成配置文件，同上
- 最后，af-webpack/build 运行，使用 webpack 进行打包

##### umi generate
generate 命令的是用来生成代码的
...





