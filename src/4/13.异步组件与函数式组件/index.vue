<template>
    <AsyncComponent></AsyncComponent>
</template>

<script>
export default {
    components: {
        AsyncComponent: this.defineAsyncComponent({
            loader: () => import('./todo.vue'), // 异步加载的组件
            timeout: 2000, // 超时时间
            errorComponent: ErrorComponent, // 加载失败显示的组件
            onError(retry, fail, retries) {},
            delay: 200, // 延迟展示 Loading 组件的时间
            loadingComponent: {
                setup() {
                    return () => {
                        return { type: 'h2', children: 'Loading...' }
                    }
                }
            }
        })
    },
    methods: {
        defineAsyncComponent(options) {
            // options 可以是一个 对象配置项，也可以是加载器
            if (typeof options === 'function') {
                // 如果是加载器则改成对象配置项形式
                options = {
                    loader: options
                }
            }
            const { loader } = options
            // 存储异步加载的组件
            let innerComp = null

            // 重试次数
            let retries = 0

            // 重试函数
            const load = () => {
                return loader()
                    .catch(err => {
                        // 如果指定了错误的回调函数，则抛出
                        if (options.onError) {
                            new Promise((resolve, reject) => {
                                // 重试
                                const retry = () => {
                                    resolve(load())
                                    retries++
                                }
                                // 失败
                                const fail = () => reject(err)
                                options.onError(retry, fail, retries)
                            })
                        } else {
                            throw err
                        }
                    })
            }
            return {
                name: 'AsyncComponentWrapper',
                setup() {
                    // 是否加载成功
                    const loaded = ref(false)
                    // 定义 error, 当错误发生时，用来存储错误对象
                    const error = shallowRef(null)
                    // 延迟加载的标识
                    const loading = ref(false)
                    let loadingTimer = null

                    // 若配置中 存在 delay，则开启一个定时器
                    if (options.delay) {
                        loadingTimer = setTimeout(() => {
                            loading.value = true
                        }, options.delay)
                    } else {
                        // 没有配置，则直接加载中
                        loading.value = true
                    }

                    load().then(c => {
                        innerComp = c
                        loaded.value = true
                    }).catch((err) => {
                        error.value = err
                    }).finally(() => {
                        loading.value = false
                        // 加载异步组件完毕，则关闭加载组件
                        clearTimeout(loadingTimer)
                    })

                    let timer = null
                    if (options.timeout) {
                        // 如果指定了超时事件，则开启一个定时器
                        timer = setTimeout(() => {
                            // 超时处理
                            // 标记超时了
                            const err = new Error(`Async component timed out after ${options.timeout}ms.`)
                            error.value = err
                        }, options.timeout)
                    }
                    // 包装组件被卸载时清除定时器
                    onUmounted(() => clearTimeout(timer))

                    // 占位内容
                    const placeholder = { type: Text, children: '' }

                    return () => {
                        if (loaded.value) {
                            // 异步组件加载成功, 则渲染被加载的组件
                            return { type: innerComp }
                        } else if (error.value && options.errorComponent) {
                            // 如果加载超时、加载失败，并且设置了 errorComponent
                            return { type: options.errorComponent, props: { error: error.value } }
                        } else if (loading.value && options.loadingComponent) {
                            // 异步组件正在加载，并且指定了 Loading 组件，则渲染 Loading 组件
                            return { type: options.loadingComponent }
                        }
                        return placeholder
                    }
                }
            }
        }
    }
}

</script>

<style lang="scss" scoped></style>