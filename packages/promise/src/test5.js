setTimeout(() => console.log('timeout'))

Promise.resolve().then(() => {
    console.log('promise1')
    Promise.resolve().then(() => console.log('promise2')).then(() => console.log('aaa'))
    Promise.resolve().then(() => console.log('promise3'))
}).then(() =>
  console.log('promise4')
)

console.log('normal')

