// 在这一轮事件循环中，setTimeout1 是作为 task 运行的，可以看到 paint 确实是在 task 运行完后才进行的
var t = 0;
var con = document.getElementById('con');
con.onclick = function () {
  setTimeout(function setTimeout1 () {
    con.textContent = t;
  }, 0)
};