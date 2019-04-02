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
想要将网站变成桌面应用，必须满足如下要求：
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
##### fetch 事件不触发
这可能和 service worker 的 scope 有关，因为 scope 指定网域目录上所有事项的 fetch 事件。从下面这段代码可以看出，我们的 sw.js 是在 static 目录中，注册的时候需要将路径写全。
```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./static/sw.js', { scope: '/' })
    .then(() => { console.log('Service Worker Registered'); });
}
```
这导致 sw.js 的 maxScope 为 '/static/'，如果设置为 '/' 就会报错。就需要在服务端响应头中添加 `Service-Worker-Allowed: /`。
```javascript
server.use((req, res, next) => {
  res.append('Service-Worker-Allowed', '/');
  next();
});
```

### 示例代码
Web App Manifest 的配置如下：
```javascript
// ./public/manifest.json
{
    "short_name": "gogo",
    "name": "gogo",
    "start_url": "/",
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
让 Service Worker 监听 fetch 事件。
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
// ./src/app.js
window.addEventListener('beforeinstallprompt', function (e) {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();

  console.log('beforeinstallprompt');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => { console.log('Service Worker Registered'); });
}
```

## 参考
[How to Use the 'beforeinstallprompt' 🔔 Event to Create a Custom PWA Add to Homescreen Experience](https://love2dev.com/blog/beforeinstallprompt)  

[Install Progressive Web App (PWA) natively on Windows/macOS via Chrome Browser](https://medium.com/@dhormale/install-pwa-on-windows-desktop-via-google-chrome-browser-6907c01eebe4)  

[Desktop Progressive Web Apps](https://developers.google.com/web/progressive-web-apps/desktop)
桌面应用的设计
![4](https://github.com/104gogo/Invoker/raw/master/images/desktop/4.png)


