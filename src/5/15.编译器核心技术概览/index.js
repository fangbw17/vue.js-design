var Compiler = (function (exports) {
  const State = {
    initial: 1,
    tagBegin: 2,
    tagName: 3,
    text: 4,
    tagEnd: 5,
    tagEndName: 6,
  };

  function parse(template) {
    const tokens = tokenize(template);
    // 模板树
    const templateAST = {
      type: "Root",
      children: [],
    };
    const container = [templateAST];

    tokens.forEach((token, index) => {
      console.log(token);
      // 获取 容器栈顶上的节点
      const curElement = container[container.length - 1]
      if (token.type === "tag") {
        // 生成子节点
        const obj = {
          type: "Element",
          tag: token.name,
          children: [],
        };
        // 作为当前节点的子节点添加
        curElement.children.push(obj);
        // 添加进容器
        container.push(obj)
        // 开始标签
      } else if (token.type === "text") {
        const obj = {
          type: "Text",
          content: token.content,
        };
        curElement.children.push(obj)
        // 文本
      } else if (token.type === "tagEnd") {
        // 结束标签
        container.pop()
      }
    });

    return templateAST;
  }

  function transform(templateAST) {}

  function generate(jsAST) {}

  function tokenize(str) {
    let state = State.initial;
    // 缓存字符
    const chars = [];
    // 结果
    const res = [];
    // 辅助函数，判断字符是否是字母
    const isLetter = (char) =>
      (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
    while (str) {
      const char = str[0];
      switch (state) {
        case State.initial:
          // 初始状态
          if (char === "<") {
            state = State.tagBegin;
            // 消费字符
            str = str.slice(1);
          } else if (isLetter(char)) {
            // 字母
            state = State.text;
            // 缓存字符
            chars.push(char);
            str = str.slice(1);
          }
          break;
        case State.tagBegin:
          // 开始标签
          if (isLetter(char)) {
            state = State.tagName;
            chars.push(char);
            str = str.slice(1);
          } else if (char === "/") {
            state = State.tagEnd;
            str = str.slice(1);
          }
          break;
        case State.tagName:
          // 开始标签名称
          if (isLetter(char)) {
            // 从 开始标签切换至开始标签名称，直接记录
            chars.push(char);
            str = str.slice(1);
          } else if (char === ">") {
            state = State.initial;
            // 开始标签结束
            res.push({
              type: "tag",
              name: chars.join(""),
            });
            // 清空开始字符
            chars.length = 0;
            str = str.slice(1);
          }
          break;
        case State.text:
          // 文本状态
          if (char === "<") {
            state = State.tagBegin;
            res.push({
              type: "text",
              content: chars.join(""),
            });
            chars.length = 0;
            str = str.slice(1);
          } else {
            chars.push(char);
            str = str.slice(1);
          }
          break;
        case State.tagEnd:
          // 结束标签
          if (isLetter(char)) {
            state = State.tagEndName;
            chars.push(char);
            str = str.slice(1);
          }
          break;
        case State.tagEndName:
          // 结束标签名称
          if (isLetter(char)) {
            chars.push(char);
            str = str.slice(1);
          } else if (char === ">") {
            state = State.initial;
            res.push({
              type: "tagEnd",
              name: chars.join(""),
            });
            chars.length = 0;
            str = str.slice(1);
          }
          break;

        default:
          break;
      }
    }
    return res;
  }

  exports.parse = parse;
  exports.transform = transform;
  exports.generate = generate;

  Object.defineProperty(exports, "__esModule", { value: true });

  return exports;
})({});
