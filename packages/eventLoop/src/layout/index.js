var con = document.getElementById('con');
con.onclick = function click1() {
  // 同一个 task 里面触发回流
  // for (var i = 0; i < 10; i++) {
  //   con.style.width = `${i * 10}px`;
  //   console.log(con.style.width);
  // }

  // 在不同的 task 里面触发回流
  for (let i = 0; i < 100; i++) {
    setTimeout(function settimeout1() {
      con.style.width = i + 'px';
      console.log(con.style.width);
    }, 0);
  }
};