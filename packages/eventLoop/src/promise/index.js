var con = document.getElementById('con');
con.onclick = function () {
  Promise.resolve().then(function Promise1 () {
    con.textContent = 0;
  })
};