var con = document.getElementById('con');
con.onclick = function click1() {
  //Layout未dirty 访问domA.offsetWidth不会Force Layout
  con.style.width = (con.offsetWidth + 1) + 'px'
  //Layout已经dirty， Force Layout
  con.style.width = (con.offsetWidth + 1) + 'px'
  //Layout已经dirty， Force Layout
  con.style.width = (con.offsetWidth + 1) + 'px'

  // con.style.width = '10px'
  // con.style.width = '10px'
  // con.style.width = '10px'
  // con.style.width = '10px'
};