var con = document.getElementById('con');
con.onclick = function click1() {
  // 1.纯js代码
  // console.log('没有 layout paint 的过程')

  /**
   * 2.触发回流
   *
   * a.添加或删除可见的DOM元素
   * b.元素的位置发生变化
   * c.元素的尺寸发生变化（包括外边距、内边框、边框大小、高度和宽度等）
   * d.内容发生变化，比如文本变化或图片被另一个不同尺寸的图片所替代。
   * e.页面一开始渲染的时候（这肯定避免不了）
   * f.浏览器的窗口尺寸变化（因为回流是根据视口的大小来计算元素的位置和大小的）
   */
  // con.style.width = '10px'
  // con.style.width = '20px'
  // con.style.width = '30px'
  // con.style.width = '40px'
  // con.style.width = '50px'

  /**
   * 3.触发强制同步回流
   *
   * offsetTop、offsetLeft、offsetWidth、offsetHeight
   * scrollTop、scrollLeft、scrollWidth、scrollHeight
   * clientTop、clientLeft、clientWidth、clientHeight
   * getComputedStyle()
   * getBoundingClientRect
   *
   * 网上很多文章说的，在 js 中使用如上的属性或方法，就会触发强制同步回流，这样的说法其实是不正确的
   */

  // con.style.width = '50px'

  // const style = getComputedStyle(con)
  // const offsetWidth = con.offsetWidth
  // const width = style.getPropertyValue('width');

  //Layout未dirty 访问domA.offsetWidth不会Force Layout
  // con.style.width = (con.offsetWidth + 1) + 'px'
  // //Layout已经dirty， Force Layout
  // con.style.width = (con.offsetWidth + 1) + 'px'
  // //Layout已经dirty， Force Layout
  // con.style.width = (con.offsetWidth + 1) + 'px'

  // const offsetWidth = con.offsetWidth;
  // con.style.width = (offsetWidth + 1) + 'px'
  // con.style.width = (offsetWidth + 1) + 'px'
  // con.style.width = (offsetWidth + 1) + 'px'
};