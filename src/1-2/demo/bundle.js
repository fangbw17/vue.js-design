// export function foo(obj) {
//     obj && obj.foo
// }

// export function bar(obj) {
//     obj && obj.bar
// }
let handleError = null;
var utils = {
    foo(fn) {
        callWithErrorHandling(fn);
    },
    // 用户可以调用该函数注册统一的错误处理函数
    registerErrorHandler(fn) {
        handleError = fn;
    }
};

function callWithErrorHandling(fn) {
    try {
        fn && fn();
    } catch (e) {
        handleError(e);
    }
}

// import { foo } from './utils'

utils.registerErrorHandler((e) => {
    console.log('错误处理: ', e);
});
utils.foo('12');
