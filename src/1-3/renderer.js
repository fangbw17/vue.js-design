/**
 * @description: 渲染函数
 * @param {Object} vnode
 * @param {Element | String} container
 */
const renderer = (vnode, container) => {
  if (typeof vnode.tag === "string") {
    // vnode 描述的是标签元素
    mountElement(vnode, container);
  } else if (typeof vnode.tag === "function") {
    // vnode 描述的是组件
    mountComponent(vnode, container);
  }
};

/**
 * @description: 渲染组件
 * @param {*} vnode
 * @param {*} container
 */
const mountComponent = (vnode, container) => {
    // 调用组件函数，获取组件要渲染的内容（虚拟 DOM）
    const subtree = vnode.tag()
    // 递归地调用 renderer 渲染 subtree
    renderer(subtree, container)
}

/**
 * @description: 渲染虚拟 DOM
 * @param {*} vnode
 * @param {*} container
 */
const mountElement = (vnode, container) => {
  // 使用 vnode.tag 作为标签名称创建 DOM 元素
  const el = document.createElement(vnode.tag);
  // 遍历 vnode.props, 将属性、事件添加到 DOM 事件
  for (const key in vnode.props) {
    if (/^on/.test(key)) {
      // 如果 key 以 on 开头，说明是事件
      el.addEventListener(
        key.substring(2).toLowerCase(), // 事件名称 onClick -> click
        vnode.props[key]
      );
    }
  }

  // 处理 children
  if (typeof vnode.children === "string") {
    // 如果 children 是字符串, 说明它是元素的文本子节点
    el.appendChild(document.createTextNode(vnode.children));
  } else if (Array.isArray(vnode.children)) {
    // 递归地调用 renderer 函数渲染子节点，使用当前元素 el 作为挂载点
    vnode.children.forEach((child) => renderer(child, el));
  }

  // 容器若为字符串，则通过字符串查找 DOM
  if (typeof container === "string")
    container = document.querySelector(container);

  // 添加元素
  container.appendChild(el);
};
