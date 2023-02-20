const PatchFlags = {
  TEXT: 1, // 代表节点有动态的 textContent
  CLASS: 2, // 代表元素有动态的 class 绑定
  STYLE: 3, // 动态 style 绑定
};

// 动态节点栈
const dynamicChildrenStack = [];
// 当前动态节点集合
let currentDynamicChildren = null;
// openBlock 用来创建一个新的动态节点集合，并将该集合压入栈中
function openBlock() {
  dynamicChildrenStack.push((currentDynamicChildren = []));
}
// closeBlock 用来将通过 openBlock 创建的动态节点集合从栈中弹出
function closeBlock() {
  currentDynamicChildren = dynamicChildrenStack.pop();
}

function createVNode(tag, props, children, flags) {
  const key = props && props.key;
  props && delete props.key;

  const vnode = {
    tag,
    props,
    children,
    key,
    patchFlags: flags,
  };

  if (typeof flags !== "undefined" && currentDynamicChildren) {
    currentDynamicChildren.push(vnode);
  }

  return vnode;
}

function createBlock(tag, props, children) {
    // block 本质也是一个 vnode
    const block = createVNode(tag, props, children)
    // 将当前动态节点集合作为 blcok.dynamicChildren
    block.dynaimcChildren = currentDynamicChildren

    // 关闭 block
    closeBlock()
    // 返回
    return block
}

function render() {
  return (
    openBlock(),
    createBlock("div", null, [
      createVNode("p", { class: "foo" }, null, 1 /*patch flag*/),
      createVNode("p", { class: "bar" }, null),
    ])
  );
}
