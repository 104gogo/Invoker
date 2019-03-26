var Promise = require('lie');

const wait = (v, time) => new Promise((resolve) => setTimeout(() => resolve(v), time));
const doSomething = v =>  console.log(v);

Promise.resolve(wait(1, 2000)).then(doSomething);
new Promise((resolve) => {
  setTimeout(() => resolve(2), 2000);
})
.then(doSomething);

Promise.resolve().then(() => console.log('立即打印'));