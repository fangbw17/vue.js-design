// export function foo(obj) {
//     obj && obj.foo
// }

// export function bar(obj) {
//     obj && obj.bar
// }
let handleError = null
export default {
    foo(fn) {
        callWithErrorHandling(fn)
    },
    // 用户可以调用该函数注册统一的错误处理函数
    registerErrorHandler(fn) {
        handleError = fn
    }
}

function callWithErrorHandling(fn) {
    try {
        fn && fn()
    } catch (e) {
        handleError(e)
    }
}