// 简易的响应式
{
  function fn() {
    // 存储副作用函数的容器
    const bucket = new Set();

    // 原始数据
    const data = { text: "hello world" };
    // 对原始数据的代理
    const obj = new Proxy(data, {
      // 拦截读取操作
      get(target, key) {
        // 将副作用函数 effect 添加到存储副作用函数的容器中
        bucket.add(effect);
        return target[key];
      },
      // 拦截设置操作
      set(target, key, newVal) {
        // 设置属性值
        target[key] = newVal;
        // 把副作用函数从容器里取出并执行
        bucket.forEach((fn) => fn());
        // 返回 true 代表设置操作成功
        return true;
      },
    });

    // 副作用函数
    function effect() {
      // 操作 DOM 赋值
      document.body.innerHTML = obj.text;
    }

    effect();
    setTimeout(() => {
      obj.text = "hello vue";
    }, 2000);
  }

//   fn();
}

// 详细版响应式
{
    // 测试函数
    function fn() {
        // 原始数据
        // const data  = { 
        //     name: '张三',
        //     sex: '男',
        //     age: 20,
        //     school: {
        //         schoolName: '关山口职业技术学院',
        //         address: '珞喻路1037号'
        //     }
        // }
        const data = { ok: true, text: "hello world" };

        // 声明变量，保存副作用函数（避免副作用函数的命名硬编码）
        let activeEffect
        // effect 栈
        const effectStack = []

        // 容器
        const bucket = new WeakMap()
        // Proxy 对象
        const obj = new Proxy(data, {
            // 拦截读取操作
            get(target, key) {
                // 追踪
                track(target, key)
                // 返回值
                return target[key]
            },
            // 拦截设置操作
            set(target, key, val) {
                // 赋值
                target[key] = val
                // 执行副作用函数
                trigger(target, key)
            }
        })
        // 在 get 拦截函数内调用 track 函数追踪变化
        function track(target, key) {
            // 当前副作用函数不存在，直接 return
            if (!activeEffect) return
            // 从容器中获取字段
            let depsMap = bucket.get(target)
            // 如果不存在, 创建一个新 Map 并赋值
            if (!depsMap) bucket.set(target, (depsMap = new Map()))
            // 从容器中获取字段对应的副作用函数容器
            let effectSet = depsMap.get(key)
            // 如果不存在，创建一个新 Set 并赋值
            if (!effectSet) depsMap.set(key, (effectSet = new Set()))
            // 添加副作用函数
            effectSet.add(activeEffect)
            // effectSet 就是一个与当前副作用函数存在练习的依赖集合
            // 将其添加到 activeEffect。deps 数组中
            activeEffect.deps.push(effectSet)
        }
        // 在 set 拦截函数内调用 trigget 函数执行变化
        function trigger(target, key) {
            console.log('trigger');
            // 获取字段容器
            const depsMap = bucket.get(target)
            if (!depsMap) return
            // 获取副作用函数容器
            const effectSet = depsMap.get(key)
            // 执行副作用函数
            const effectsToRun = new Set()
            effectSet && effectSet.forEach(effectFn => {
                // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
                if (effectFn !== activeEffect) {
                    effectsToRun.add(effectFn)
                }
            })
            effectsToRun.forEach(effectFn => {
                // 如果一个副作用函数存在调用器，则调用该调度器，并将副作用作为参数传递
                if (effectFn.options.scheduler) {
                    effectFn.options.scheduler(effectFn)
                } else {
                    effectFn()
                }
            })
            // effectSet && effectSet.forEach(fn => fn())
        }

        // 注册副作用函数
        function registerEffect(fn, options = {}) {
            const effectFn = () => {
                // 调用 cleanup 函数完成清除工作
                cleanup(effectFn)
                // 当 effectFn 执行时，将其设置为当前激活的副作用函数
                activeEffect = effectFn
                // 调用副作用函数之前将当前副作用函数压入栈中
                effectStack.push(effectFn)
                fn()
                // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
                effectStack.pop()
                activeEffect = effectStack[effectStack.length - 1]
            }
            // 挂载 options
            effectFn.options = options
            // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
            effectFn.deps = []
            // 执行副作用函数
            effectFn()
        }
        // 清除函数
        function cleanup(effectFn) {
            // 遍历 effectFn.deps 数组
            for (let i = 0; i < effectFn.deps.length; i++) {
                // deps 是依赖集合
                const deps = effectFn.deps[i]
                // 移除
                deps.delete(effectFn)
            }
            // 重置 effectFn.deps 数组
            effectFn.deps.length = 0
        }
        // 执行注册
        registerEffect(() => {
            document.body.innerHTML = obj.ok ? obj.text : 'no'
        })

        setTimeout(() => {
            // obj.text = 'hello vue'
            obj.ok = false
            console.log(bucket);
        }, 2000)
    }
    fn()
}