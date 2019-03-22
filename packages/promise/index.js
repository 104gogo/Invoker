const Promise = require('lie');

var doSomething = v => console.log(v);
var promise1 = Promise.resolve(1);
var promise2 = promise1.then(v => v + 2);
var promise3 = promise2.then(v => v + 3);
var promise4 = promise3.then(doSomething);

console.log(promise1 === promise2); // false
console.log(promise2 === promise3); // false
console.log(promise3 === promise4); // false