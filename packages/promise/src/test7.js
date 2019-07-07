Promise.resolve()
  .then(() => {
    console.log('promise 1')
    Promise.resolve().then(() => {
      console.log('promise 2')
      Promise.resolve().then(() => {
        console.log('promise 3')
      })
    })
  })
  .then(()=> {
    console.log('promise 4')
  });

// 添加 return
Promise.resolve()
  .then(() => {
    console.log('promise 1')
    return Promise.resolve().then(() => {
      console.log('promise 2')
      return Promise.resolve().then(() => {
        console.log('promise 3')
      })
    })
  })
  .then(()=> {
    console.log('promise 4')
  });


