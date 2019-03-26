// var Promise = require('lie');

var p1 = Promise.resolve(1);
var p2 = Promise.resolve(p1);

console.log(p1 === p2);