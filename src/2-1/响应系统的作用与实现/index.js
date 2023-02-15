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
    const data = { ok: true, text: "hello world", foo: 20, bar: 12 };

    // 声明变量，保存副作用函数（避免副作用函数的命名硬编码）
    let activeEffect;
    // effect 栈
    const effectStack = [];
    // 定义一个任务队列
    const jobQueue = new Set();
    // 使用 Promise.resolve() 创建一个 promise 实例，用它将一个任务添加到微任务队列
    const p = Promise.resolve();
    // 一个标志代表是否正在刷新队列
    let isFlushing = false;
    // 容器
    const bucket = new WeakMap();

    const ITERATE_KEY = Symbol();

    const MAP_KEY_ITERATE_KEY = Symbol();

    // 定义一个 Map 实例，存储原始对象到代理对象的映射
    const reactiveMap = new Map();
    // 重写数组方法
    const originMethod = Array.prototype.includes;
    const arrayInstrumentations = {};
    [("includes", "indexOf", "lastIndexOf")].forEach((method) => {
      const originMethod = Array.prototype[method];
      arrayInstrumentations[method] = function (...args) {
        // this 是代理对象，先再代理对象中查找，将结果存储到 res 中
        let res = originMethod.apply(this, args);
        if (res === false || res === -1) {
          // res 为 false 说明没有找到，通过 this.raw 拿到原始数组，再去其中查找并更新 res 值
          res = originMethod.apply(this.raw, args);
        }
        // 返回最终结果
        return res;
      };
    });
    // 一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪
    let shouldTrack = true;
    // 重写 push 方法
    ["push", "pop", "shift", "unshift", "splice"].forEach((method) => {
      const originMethod = Array.prototype[method];
      arrayInstrumentations[method] = function (...args) {
        // 调用原始方法之前，禁止追踪
        shouldTrack = false;
        // push 方法的默认行为
        let res = originMethod.apply(this, args);
        shouldTrack = true;
        return res;
      };
    });
    // 定义一个对象，将自定义的 add 方法定义到该对象下
    const mutableInstrumentations = {
      add(key) {
        // this 仍然指向的是代理对象，通过 raw 属性获取原始数据对象
        const target = this.raw;
        // 通过原始数据对象执行 add 方法添加具体的值
        // 这里不需要 .bind 了，因为是直接通过 target 调用并执行
        const res = target.add(key);
        // 调用 trigger 函数触发响应，并指定操作类型为 ADD
        if (!target.has(key)) trigger(target, key, "ADD");
        return res;
      },
      delete(key) {
        const target = this.raw;
        const res = target.delete(key);
        if (target.has(key)) trigger(target, key, "DELETE");
        return res;
      },
      get(key) {
        const target = this.raw;
        track(target, key);
        if (target.has(key)) {
          const res = target.get(key);
          return typeof res === "object" ? reactive(res) : res;
        }
      },
      set(key, value) {
        const target = this.raw;
        const had = target.has(key);
        // 获取旧值
        const oldValue = target.get(key);
        // 设置新值
        // 获取原始数据，由于 value 本身可能已经是原始数据，所以此时 value.raw 不存在，则直接使用 value
        const rawValue = value.raw || value;
        target.set(key, rawValue);
        // 不存在，则说明是 ADD 操作
        if (!had) {
          trigger(target, key, "ADD");
        } else if (
          oldValue !== value ||
          (oldValue === oldValue && value === value)
        ) {
          trigger(target, key, "SET");
        }
      },
      forEach(callback, thisArg) {
        // wrap 函数用来把可代理的值转换为响应式数据
        const wrap = (val) => (typeof val === "object" ? reactive(val) : val);
        const target = this.raw;
        track(target, ITERATE_KEY);
        // 通过 target 调用原始 forEach 方法进行遍历
        target.forEach((v, k) => {
          // 手动调用 callback，用 wrap 函数包裹 vlaue 和 key 后再传给 callback，这样就实现了深响应
          callback.call(thisArg, wrap(v), wrap(k), this);
        });
      },
      [Symbol.iterator]: iterationMethod,
      entries: iterationMethod,
      values: valuesIterationMethod,
      keys: keysIterationMethod,
    };
    // 迭代器方法
    function iterationMethod() {
      // 获取原始数据对象 target
      const target = this.raw;
      // 获取原始迭代器方法
      const itr = target[Symbol.iterator]();

      const wrap = (val) =>
        typeof val === "object" && val !== null ? reactive(val) : val;

      // 调用 track 函数建立响应联系
      track(target, ITERATE_KEY);

      // 返回自定义的迭代器
      return {
        // 实现迭代器协议
        next() {
          // 调用原始迭代器的 next 方法获取 value 和 done
          const { value, done } = itr.next();
          return {
            // 如果 value 不是 undefined，则对其进行包裹
            value: value ? [wrap(value[0]), wrap(value[1])] : value,
            done,
          };
        },
        // 实现可迭代协议
        [Symbol.iterator]() {
          return this;
        },
      };
      // 将其返回
      return itr;
    }
    // 迭代器 value 方法
    function valuesIterationMethod() {
      // 获取原始数据对象 target
      const target = this.raw;
      // 通过 target.values 获取原始迭代器方法
      const itr = target.values();

      const wrap = (val) => (typeof val === "object" ? reactive(val) : val);

      track(target, ITERATE_KEY);

      return {
        next() {
          const { value, done } = itr.next();
          return {
            value: wrap(value),
            done,
          };
        },
        [Symbol.iterator]() {
          return this;
        },
      };
    }
    // 迭代器 key 方法
    function keysIterationMethod() {
      // 获取原始数据对象 target
      const target = this.raw;
      // 获取原始迭代器方法
      const itr = target.keys();

      const wrap = (val) => (typeof val === "object" ? reactive(val) : val);

      track(target, MAP_KEY_ITERATE_KEY);

      return {
        next() {
          const { value, done } = itr.next();
          return {
            value: wrap(value),
            done,
          };
        },
        [Symbol.iterator]() {
          return this;
        },
      };
    }

    // Proxy 对象
    // const obj = reactive(data);
    /**
     * @description: 创建响应式
     * @param {Object|Array|Map|Set|WeakMap|Function} obj 原始数据
     * @param {Boolean} isShallow 深/浅响应
     * @param {Boolean} isReadonly 是否只读
     */
    function createReactive(obj, isShallow = false, isReadonly = false) {
      return new Proxy(obj, {
        // 拦截读取操作
        get(target, key, receiver) {
          // 代理对象可以通过 raw 属性访问原始数据
          if (key === "raw") {
            return target;
          }
          // 封装用于代理 set/Map 类型数据的逻辑
          if (key === "size") {
            track(target, ITERATE_KEY);
            return Reflect.get(target, key, target);
          }

          // 如果操作的目标对象是数组，并且 key 存在于 arrayInstrumentations 上，
          // 那么返回定义在 arrayInstrumentations 上的值
          if (
            Array.isArray(target) &&
            arrayInstrumentations.hasOwnProperty(key)
          ) {
            return Reflect.get(arrayInstrumentations, key, receiver);
          }
          // 非只读建立响应联系
          if (!isReadonly && typeof key !== "symbol") {
            // 追踪
            track(target, key);
          }
          // const res = Reflect.get(target, key, receiver);
          // const res = target[key].bind(target);
          let res = mutableInstrumentations[key];
          if (res === undefined) res = Reflect.get(target, key, receiver);

          // 浅响应直接返回对象
          if (isShallow) {
            return res;
          }

          if (typeof res === "object" && res !== null) {
            // 调用 reactive 将嵌套属性包装成响应式
            return isReadonly ? readonly(res) : reactive(res);
          }
          // 返回值
          return res;
        },
        // 拦截设置操作
        set(target, key, val, receiver) {
          // 只读
          if (isReadonly) {
            console.warn(`属性 ${key} 是只读的`);
            return true;
          }
          // 先获取旧值
          const oldVal = target[key];
          const type = Array.isArray(target)
            ? Number(key) < target.length
              ? "SET"
              : "ADD"
            : Object.prototype.hasOwnProperty.call(target, key)
            ? "SET"
            : "ADD";
          // 赋值
          const res = Reflect.set(target, key, val, receiver);
          // 执行副作用函数
          // 将 type 作为第三个参数传递给 trigger 函数
          // 原型继承
          if (target === receiver.raw) {
            if (oldVal !== val && (oldVal === oldVal || val === val))
              trigger(target, key, type, val);
          }

          return res;
        },
        // 'foo' in obj
        has(target, key) {
          track(target, key);
          return Reflect.has(target, key);
        },
        // for...in
        ownKeys(target) {
          track(target, Array.isArray(target) ? "length" : ITERATE_KEY);
          return Reflect.ownKeys(target);
        },
        // delete property
        deleteProperty(target, key) {
          // 只读
          if (isReadonly) {
            console.warn(`属性 ${key} 是只读的`);
            return true;
          }
          // 检查被操作的属性是否是对象自己的属性
          const hasKey = Object.prototype.hasOwnProperty.call(target, key);
          // 使用 Reflect.deleteProperty 完成属性的删除
          const res = Reflect.deleteProperty(target, key);
          // Reflect 删除成功，并且是自身属性才触发副作用函数
          if (res && hasKey) {
            trigger(target, key, "DELETE");
          }
          return res;
        },
      });
    }
    // 深度响应
    function reactive(obj) {
      // 优先通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
      if (reactiveMap.has(obj)) {
        return reactiveMap.get(obj);
      }
      // 创建新的代理对象
      const proxy = createReactive(obj);
      // 存储
      reactiveMap.set(obj, proxy);
      return proxy;
    }
    // 浅响应
    function shallowReactive(obj) {
      return createReactive(obj, true);
    }
    // 只读
    function readonly(obj) {
      return createReactive(obj, false, true /* 只读 */);
    }
    function shallowReadonly(obj) {
      return createReactive(obj, true /* shallow */, true);
    }
    // 基础数据类型的响应式函数
    function ref(val) {
      // Proxy 不能代理拦截基础数据类型，包裹一层
      const wrap = {
        value: val,
      };
      // 使用 Object.defineProperty 在 wrap 对象上定义一个不可枚举的属性 __v_isRef, 并且值为 true
      Object.defineProperty(wrap, "__v_isRef", {
        value: true,
      });
      // 将包裹对象变成响应式数据
      return reactive(wrap);
    }
    // toRef
    function toRef(obj, key) {
      const wrap = {
        get value() {
          return obj[key];
        },
        set value(val) {
          obj[key] = val
        }
      };
      Object.defineProperty(wrap, '__v_isRef', {
        value: true
      })
      return wrap;
    }
    // toRefs
    function toRefs(obj) {
      const ret = {};
      for (const key in obj) {
        ret[key] = toRef(obj, key);
      }
      return ret;
    }
    function proxyRefs(target) {
      return new Proxy(target, {
        get(target, key, receiver) {
          const value = Reflect.get(target, key, receiver)
          // 自动脱 ref 实现：如果读取的值是 ref，则返回它的value属性值
          return value.__v_isRef ? value.value : value
        },
        set(target, key, newValue, receiver) {
          const value = target[key]
          if (value.__v_isRef) {
            value.value = newValue
            return true
          }
          return Reflect.set(target, key, value, receiver)
          
        }
      })
    }
    // 在 get 拦截函数内调用 track 函数追踪变化
    function track(target, key) {
      // 禁止追踪
      if (!shouldTrack) return;
      // 当前副作用函数不存在，直接 return
      if (!activeEffect) return;
      // 从容器中获取字段
      let depsMap = bucket.get(target);
      // 如果不存在, 创建一个新 Map 并赋值
      if (!depsMap) bucket.set(target, (depsMap = new Map()));
      // 从容器中获取字段对应的副作用函数容器
      let effectSet = depsMap.get(key);
      // 如果不存在，创建一个新 Set 并赋值
      if (!effectSet) depsMap.set(key, (effectSet = new Set()));
      // 添加副作用函数
      effectSet.add(activeEffect);
      // effectSet 就是一个与当前副作用函数存在练习的依赖集合
      // 将其添加到 activeEffect。deps 数组中
      activeEffect.deps.push(effectSet);
    }
    // 在 set 拦截函数内调用 trigget 函数执行变化
    function trigger(target, key, type, newVal) {
      console.log("trigger");
      // 获取字段容器
      const depsMap = bucket.get(target);
      if (!depsMap) return;
      // 获取副作用函数容器
      const effectSet = depsMap.get(key);
      // 执行副作用函数
      const effectsToRun = new Set();
      effectSet &&
        effectSet.forEach((effectFn) => {
          // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn);
          }
        });

      if (type === "ADD" && Array.isArray(target)) {
        // 取出与 length 相关联的副作用函数
        const lengthEffects = depsMap.get("length");
        lengthEffects &&
          lengthEffects.forEach((effectFn) => {
            if (key >= newVal) {
              if (effectFn !== activeEffect) {
                effectsToRun.add(effectFn);
              }
            }
          });
      }
      if (
        type === "ADD" ||
        type === "DELETE" ||
        (type === "SET" &&
          Object.prototype.toString.call(target) === "[object Map]")
      ) {
        // 获取与 ITERATE_KEY 相关联的副作用函数
        const iterateEffects = depsMap.get(ITERATE_KEY);
        // 将与 ITERATE_KEY 相关联的副作用函数也添加到 effectsToRun
        iterateEffects &&
          iterateEffects.forEach((effectFn) => {
            if (effectFn !== activeEffect) {
              effectsToRun.add(effectFn);
            }
          });
      }

      if (
        (type === "ADD" || type === "DELETE") &&
        Object.prototype.toString.call(target) === "[object Map]"
      ) {
        // 获取与 ITERATE_KEY 相关联的副作用函数
        const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY);
        // 将与 ITERATE_KEY 相关联的副作用函数也添加到 effectsToRun
        iterateEffects &&
          iterateEffects.forEach((effectFn) => {
            if (effectFn !== activeEffect) {
              effectsToRun.add(effectFn);
            }
          });
      }
      effectsToRun.forEach((effectFn) => {
        // 如果一个副作用函数存在调用器，则调用该调度器，并将副作用作为参数传递
        if (effectFn.options.scheduler) {
          effectFn.options.scheduler(effectFn);
        } else {
          effectFn();
        }
      });
      // effectSet && effectSet.forEach(fn => fn())
    }

    // 调度执行
    function flushJob() {
      // 如果队列正在刷新，则什么都不做
      if (isFlushing) return;
      // 设置为 true，代表正在刷新
      isFlushing = true;
      // 在微任务队列中刷新 jobQueue 队列
      p.then(() => {
        jobQueue.forEach((job) => job());
      }).finally(() => {
        // 结束重置 isFlushing 状态
        isFlushing = false;
      });
    }

    // 计算属性 computed
    function computed(getter) {
      // value 用来缓存上一次计算的值
      let value;
      // dirty 标志，用来标识是否需要重新计算值，为 true 则意味着“脏”，需要计算
      let dirty = true;
      // 把 getter 作为副作用函数，创建一个 lazy 的 effect
      const effectFn = registerEffect(getter, {
        lazy: true,
        scheduler() {
          if (!dirty) {
            dirty = true;
            // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数触发响应
            trigger(obj, "value");
          }
        },
      });

      const obj = {
        // 当读取到 value 时才执行 effectFn
        get value() {
          // 只有“脏”时才计算值，并将得到的值缓存到 value 中
          if (dirty) {
            value = effectFn();
            // 将 dirty 设置为 false，下一次访问直接使用缓存到 value 中的值
            dirty = false;
            console.log("计算");
          }
          track(obj, "value");
          return value;
        },
      };

      return obj;
    }

    // 注册副作用函数
    function registerEffect(fn, options = {}) {
      const effectFn = () => {
        // 调用 cleanup 函数完成清除工作
        cleanup(effectFn);
        // 当 effectFn 执行时，将其设置为当前激活的副作用函数
        activeEffect = effectFn;
        // 调用副作用函数之前将当前副作用函数压入栈中
        effectStack.push(effectFn);
        // 将 fn 的执行结果存储到 res 中
        const res = fn();
        // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
        effectStack.pop();
        activeEffect = effectStack[effectStack.length - 1];
        // 将 res 作为 effectFn 的返回值
        return res;
      };
      // 挂载 options
      effectFn.options = options;
      // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
      effectFn.deps = [];
      // 当不存在 lazy 的时候，才执行
      if (!options.lazy) {
        // 执行副作用函数
        effectFn();
      }
      return effectFn;
    }
    // 清除函数
    function cleanup(effectFn) {
      // 遍历 effectFn.deps 数组
      for (let i = 0; i < effectFn.deps.length; i++) {
        // deps 是依赖集合
        const deps = effectFn.deps[i];
        // 移除
        deps.delete(effectFn);
      }
      // 重置 effectFn.deps 数组
      effectFn.deps.length = 0;
    }
    // 执行注册
    // registerEffect(
    //   () => {
    //     document.body.innerHTML = obj.foo;
    //     console.log(obj.foo);
    //   },
    //   {
    //     scheduler(fn) {
    //       // 每次调度时，将副作用函数添加到 jobQueue 队列中
    //       jobQueue.add(fn);
    //       // 调用 flushJob 刷新队列
    //       flushJob();
    //     },
    //   }
    // );

    // obj.foo++
    // obj.foo++
    // setTimeout(() => {
    //     obj.foo++
    // }, 2000)

    // const sumRes = computed(() => obj.foo + obj.bar);
    // registerEffect(() => {
    //   console.log(sumRes.value);
    // });
    // obj.foo++;

    // const obj = {};
    // const arr = reactive([obj]);
    // console.log(arr.includes(obj));

    // const s = new Set([1, 2, 3]);
    // const pp = reactive(s);
    // registerEffect(() => {
    //   console.log(pp.size);
    // });
    // pp.add(14);

    // const m = new Map();
    // const p1 = reactive(m);
    // const p2 = reactive(new Map());
    // p1.set("p2", p2);
    // registerEffect(() => {
    //   console.log(m.get("p2").size);
    // });
    // m.get("p2").set("foo", 1);

    // const p1 = reactive(
    //   new Map([
    //     ["key1", "value1"],
    //     ["key2", "value2"],
    //   ])
    // );
    // registerEffect(() => {
    //   for (const key of p1.keys()) {
    //     console.log(key);
    //   }
    // });
    // p1.set("key2", "value3");

    // const p2 = reactive({
    //   adress: '胡同1'
    // })
    // registerEffect(() => {
    //   document.body.innerHTML = p2.address
    // })
    // setTimeout(() => {
    //   p2.address = '胡同2'
    // }, 1000)

    // const refVal = ref(1)
    // registerEffect(() => {
    //   console.log(refVal.value);
    // })
    // refVal.value = 2

    // const obj = reactive({ foo: 1, bar: 2 });

    // const newObj = {
    //   foo: {
    //     get value() {
    //       return obj.foo;
    //     },
    //   },
    //   bar: {
    //     get value() {
    //       return obj.bar;
    //     },
    //   },
    // };

    // registerEffect(() => {
    //   console.log(newObj.foo.value);
    // });

    // obj.foo = 100;

    const obj = reactive({ foo: 1, bar: 2 });
    const newObj = {...toRefs(obj)}
    console.log(newObj.foo.value);
    console.log(newObj.bar.value);
  }
  fn();
}
