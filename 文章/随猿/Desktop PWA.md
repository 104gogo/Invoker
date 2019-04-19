# Desktop PWA

## 缘起
最近谷歌浏览器更新的73版本，支持了所有平台的 Desktop 功能，如下：
> [Progressive Web Apps work everywhere](https://developers.google.com/web/updates/2019/03/nic73#pwas-everywhere)  
> Starting in Chrome 73, **Desktop Progressive Web Apps are now supported on all desktop platforms**, including Chrome OS, Linux, Mac, and Windows.

为了给大家提供像桌面应用的体验，我们决定在后台系统中试一试。

## Desktop PWA 是什么？
Desktop PWA 就是让我们的网站，变成一个类桌面应用方便使用，它没有地址栏，没有其他 tab，能使用 serviceWorker 等功能。Desktop PWA 主要是借助 Web App Manifest 实现的，然后它和 mobile PWA 的配置使用方式一样，这样可以使用同一套代码在两端实现 desktop 功能。

我们可以在 [twitter mobile](https://mobile.twitter.com/) 网站进行体验，效果如下：
![1](https://github.com/104gogo/Invoker/raw/master/images/desktop/1.png)

另外，添加到桌面的网站，会作为应用添加到 `chrome://apps/`里面，并且代表它安装了。
![2](https://github.com/104gogo/Invoker/raw/master/images/desktop/2.png)

我们可以在桌面打开此应用，也可以点击右上角的3个点选择卸载应用。
![3](https://github.com/104gogo/Invoker/raw/master/images/desktop/3.png)

### 要满足些什么要求？
想要像上面截图一样，在浏览器中看到`安装XXXX`的按钮，必须满足如下要求：
> [Native App Install Prompt](https://developers.google.com/web/fundamentals/app-install-banners/native)
> 1. The web app nor the native app are already installed.
> 2. Meets a user engagement heuristic (currently, the user has interacted with the domain for at least 30 seconds)
> 3. Includes a [Web App Manifest](https://developers.google.com/web/fundamentals/web-app-manifest/) that includes:
>   - short_name
>   - name (used in the banner prompt)
>   - icons including a 192px and a 512px version
> 4. Served over **HTTPS** (required for service workers)

另外追加一条（被坑了好久）
> [The New Add To Homescreen Flow](https://love2dev.com/blog/beforeinstallprompt/)
> - Has registered a service worker with a **fetch event handler**

除了上面这些要求，可能还会遇到其他一些问题：

##### 注册 ServiceWorker 的域名必须和当前域名一致
我们是采用前后端分离的部署方式，所以会有两个域名，导致触发了 ServiceWorker 的安全策略。错误信息如下：
![error1](https://github.com/104gogo/Invoker/raw/master/images/desktop/error1.png)

很好奇，其他网站都不会有前后端分离这样的情况吗？然后看了很多网站（手机微博，youtube 等），都是将 ServiceWorker 注册在根域名下面的。噢好吧，看来大家心照不宣的采用了相同的处理方式。

从另外一方面想，PWA 作为一个**应用**，那么它的配置就应该对应到根域名，换句话说你想要使用 ServiceWorker，请把它放在根域名下面。这样减少很多特殊配置，也规避了一些问题。

##### fetch 事件不触发
这和 ServiceWorker 注册的 scope 有关，因为 scope 指定网域目录上所有事项的 fetch 事件。

如在下面代码，我们对 static 目录的 sw.js 进行注册，这样 fetch 触发的域就是 /statc/ 下面的，为了 fetch 到全域的资源，那么需要设置`scope: /`。
```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./static/sw.js', { scope: '/' })
    .then(() => { console.log('Service Worker Registered'); });
}
```
但是 sw.js 的 maxScope 为 '/static/'，如果设置为 '/' 就会报错。这就需要在服务端响应头中添加 `Service-Worker-Allowed: /`。
```javascript
server.use((req, res, next) => {
  res.append('Service-Worker-Allowed', '/');
  next();
});
```

##### ServiceWorker 的 scope 必须包含 start_url
start_url 是 manifest.json 中的一个配置，它决定首先加载应用的哪个页面，它默认是跟路径即：/。

在测试的过程中，出现了如下报错信息（注册的时候没有设置 scope: /）。
![error2](https://github.com/104gogo/Invoker/raw/master/images/desktop/error2.png)

根据错误信息，将 start_url 改为`feynman/dist/sh` 是不是就好了？

nice，终于看到应用安装按钮了，但是打开应用之后首页显示的居然是 **404 NOT FOUND**，WTF。查看访问的网址是 https://qa-s.dev.cn/feynman/dist/sh/feynman/dist/sh 这样的，原来首页地址等于 ServiceWorker 的 scope + start_url。那么 start_url 只能写成绝对路径，但绝对路径会根据环境变化而不同，那么就需要在打包的时候动态生成 manifest.json 文件，这样就比较麻烦。

还是老老实实，设置 scope: / 吧，并且在服务端响应头加上 Service-Worker-Allowed: /。


### beforeinstallprompt 事件
如果我们要自定义`安装XXXX`按钮的显示，就需要监听 beforeinstallprompt 事件。

beforeinstallprompt 事件非常重要，它主要提供两个功能：
- 获取 prompt 方法，让用户自己决定在什么显示安装弹框
- 如果事件没有触发，可以理解为**应用已经安装**或者配置不成功

### 示例代码
Web App Manifest 的配置如下：
```javascript
// ./public/manifest.json
{
    "short_name": "gogo",
    "name": "gogo",
    "start_url": "./",
    "display": "standalone",
    "theme_color": "#282c34",
    "background_color": "#2254b9",
    "icons": [
      {
        "sizes": "192x192",
        "src": "https://abs.twimg.com/responsive-web/web/icon-default.604e2486a34a2f6e1.png",
        "type": "image/png"
      },
      {
        "sizes": "512x512",
        "src": "https://abs.twimg.com/responsive-web/web/icon-default.604e2486a34a2f6e1.png",
        "type": "image/png"
      }
    ]
}
```
注册 ServiceWorker。
```javascript
// ./src/app.js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => { console.log('Service Worker Registered'); });
}
```
让 ServiceWorker 监听 fetch 事件。
```javascript
// ./public/sw.js
self.addEventListener('install', (e) => {
  console.log('[ServiceWorker] Install');
});

self.addEventListener('activate', (e) => {
  console.log('[ServiceWorker] activate');
});

self.addEventListener('fetch', (e) => {
  console.log('[ServiceWorker] fetch');
});
```
最后监听`beforeinstallprompt`事件。如果上面的条件都满足了，就会触发此事件，这样我们可以自定义安装应用的时机。
```javascript
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('beforeinstallprompt has fired', e);
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  
  setTimeout(() => {
    // 等 2s 显示安装弹框
    e.prompt();
  }, 2000);
});
```

### 还是不成功？
如果尝试了上面所有的方法，还是没有生成 Desktop PWA，那么打开谷歌调试工具，选择`Aduits`，点击最下面的`Run aduits`，然后查看错误信息。


![4](https://github.com/104gogo/Invoker/raw/master/images/desktop/4.png)

## 参考
[How to Use the 'beforeinstallprompt' 🔔 Event to Create a Custom PWA Add to Homescreen Experience](https://love2dev.com/blog/beforeinstallprompt)  

[Install Progressive Web App (PWA) natively on Windows/macOS via Chrome Browser](https://medium.com/@dhormale/install-pwa-on-windows-desktop-via-google-chrome-browser-6907c01eebe4)  

[Desktop Progressive Web Apps](https://developers.google.com/web/progressive-web-apps/desktop)   
![5](https://github.com/104gogo/Invoker/raw/master/images/desktop/5.png)


