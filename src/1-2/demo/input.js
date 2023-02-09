// import { foo } from './utils'
// /*#__PURE__*/foo()

import utils from './utils'

utils.foo('12')
utils.registerErrorHandler((e) => {
    console.log('错误处理: ', e);
})