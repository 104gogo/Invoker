var doSomething = v => console.log(v);

var doSomethingElse = (v) => {
  var promise21 = Promise.resolve(v);
  var promise22 = promise21.then((v) => {
    var promise31 = Promise.resolve(v);
    var promise32 = promise31.then(v => v + 1);
    return promise32;
  });
  var promise23 = promise22.then(v => v + 3);

  return promise23;
};

var promise11 = Promise.resolve(1);
var promise12 = promise11.then(doSomethingElse);
var promise13 = promise12.then(doSomething); // 5