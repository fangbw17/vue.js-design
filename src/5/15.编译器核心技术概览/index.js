var Compiler = (function (exports) {
  // html 语法标记枚举
  const State = {
    initial: 1,
    tagBegin: 2,
    tagName: 3,
    text: 4,
    tagEnd: 5,
    tagEndName: 6,
  };

  /**
   * @description: 解析标记化，转成 AST 模板
   * @param {Array} 标记化后的模板
   * @return {Object} AST 模板
   */
  function parse(template) {
    const tokens = tokenize(template);
    // 模板树
    const templateAST = {
      type: "Root",
      children: [],
    };
    const container = [templateAST];

    tokens.forEach((token, index) => {
      // 获取 容器栈顶上的节点
      const curElement = container[container.length - 1];
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
        container.push(obj);
        // 开始标签
      } else if (token.type === "text") {
        const obj = {
          type: "Text",
          content: token.content,
        };
        curElement.children.push(obj);
        // 文本
      } else if (token.type === "tagEnd") {
        // 结束标签
        container.pop();
      }
    });

    return templateAST;
  }

  /**
   * @description: 将模板 AST 转成 javaScript AST
   * @param {Object} 模板 AST
   * @return {Object} javaScript AST
   */  
  function transform(ast) {
    const context = {
      currentNode: null,
      parent: null,
      replaceNode(node) {
        context.currentNode = node;
        context.parent.children[context.childIndex] = node;
      },
      // 用于删除当前节点。
      removeNode() {
        if (context.parent) {
          // 调用数组的 splice 方法，根据当前节点的索引删除当前节点
          context.parent.children.splice(context.childIndex, 1);
          // 将 context.currentNode 置空
          context.currentNode = null;
        }
      },
      nodeTransforms: [transformRoot, transformElement, transformText],
    };

    traverseNode(ast, context);
    console.log(dump(ast));
  }

  /**
   * @description: 生成渲染器
   * @param {Object} javaScript AST 
   * @return {String} code
   */  
  function generate(node) {
    const context = {
      // 存储最终生成的渲染函数代码
      code: "",
      // 在生成代码时，通过调用push函数完成代码的拼接
      push(code) {
        context.code += code;
      },
      // 缩进值
      currentIndent: 0,
      // 换行函数，换行时应该保留缩进，追加 currentIndent * 2 个空格字符
      newLine() {
        context.code += "\n" + ` `.repeat(context.currentIndent);
      },
      // 缩进
      indent() {
        context.currentIndent++;
        context.newLine();
      },
      // 取消缩进
      deIndent() {
        context.currentIndent--;
        context.newLine();
      },
    };
    // 调用 genNode 函数完成代码生成的工作，
    genNode(node, context);

    // 返回函数渲染代码
    return context.code;
  }

  /**
   * @description: 编译函数
   * @param {String} HTML 语句
   * @return {String} 渲染函数
   */  
  function compile(template) {
    // 模板 AST
    const ast = parse(template);
    // 将模板 AST 转换为 JavaScript AST
    transform(ast);
    // 代码生成
    const code = generate(ast.jsNode);

    return code;
  }

  /**
   * @description: 将模板转标记化
   * @param {String} str 模板字符串
   * @return {Array} 模板标记
   */
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

  function dump(node, indent = 0) {
    const type = node.type;
    const desc =
      node.type === "Root"
        ? ""
        : node.type === "Element"
        ? node.tag
        : node.content;

    // console.log(`${"-".repeat(indent)}${type}: ${desc}`);

    if (node.children) {
      node.children.forEach((n) => dump(n, indent + 2));
    }
  }

  function traverseNode(ast, context) {
    context.currentNode = ast;
    // 1. 增加退出阶段的回调函数数组
    const exitFns = [];
    const transforms = context.nodeTransforms;
    for (let i = 0; i < transforms.length; i++) {
      // 2. 转换函数可以返回另外一个函数，该函数即作为退出阶段的回调函数
      const onExit = transforms[i](context.currentNode, context);
      if (onExit) {
        // 将退出阶段的回调函数添加到 exitFns 数组中
        exitFns.push(onExit);
      }
      if (!context.currentNode) return;
    }

    const children = context.currentNode.children;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        context.parent = context.currentNode;
        context.childIndex = i;
        traverseNode(children[i], context);
      }
    }

    // 在节点处理的最后阶段执行缓存到 exitFns 中的回调函数
    // 注意，这里我们要反序执行
    let i = exitFns.length;
    while (i--) {
      exitFns[i]();
    }
  }

  // 用来创建 StringLiteral 节点
  function createStringLiteral(value) {
    return {
      type: "StringLiteral",
      value,
    };
  }

  // 用来创建 Identifier 节点
  function createIdentifier(name) {
    return {
      type: "Identifier",
      name,
    };
  }

  // 用来创建 ArrayExpression 节点
  function createArrayExpression(elements) {
    return {
      type: "expression",
      elements,
    };
  }

  // 用来创建 CallExpression 节点
  function createCallExpression(callee, arguments) {
    // const FunctionDeclNode = {
    //      type: 'FunctionDecl' // 代表该节点是函数声明
    //      // 函数的名称是一个标识符，标识符本身也是一个节点
    //      id: {
    //        type: 'Identifier',
    //        name: 'render' // name 用来存储标识符的名称，在这里它就是渲染函数的名称 render
    //      },
    //      params: [], // 参数，目前渲染函数还不需要参数，所以这里是一个空数组
    //      // 渲染函数的函数体只有一个语句，即 return 语句
    //      body: [
    //        {
    //          type: 'ReturnStatement',
    //          // 最外层的 h 函数调用
    //          return: {
    //            type: 'CallExpression',
    //            callee: { type: 'Identifier', name: 'h' },
    //            arguments: [
    //              // 第一个参数是字符串字面量 'div'
    //              {
    //                type: 'StringLiteral',
    //                value: 'div'
    //              },
    //              // 第二个参数是一个数组
    //              {
    //                type: 'ArrayExpression',
    //                elements: [
    //                  // 数组的第一个元素是 h 函数的调用
    //                  {
    //                    type: 'CallExpression',
    //                    callee: { type: 'Identifier', name: 'h' },
    //                    arguments: [
    //                      // 该 h 函数调用的第一个参数是字符串字面量
    //                      { type: 'StringLiteral', value: 'p' },
    //                      // 第二个参数也是一个字符串字面量
    //                      { type: 'StringLiteral', value: 'Vue' },
    //                    ]
    //                  },
    //                  // 数组的第二个元素也是 h 函数的调用
    //                  {
    //                    type: 'CallExpression',
    //                    callee: { type: 'Identifier', name: 'h' },
    //                    arguments: [
    //                      // 该 h 函数调用的第一个参数是字符串字面量
    //                      { type: 'StringLiteral', value: 'p' },
    //                      // 第二个参数也是一个字符串字面量
    //                      { type: 'StringLiteral', value: 'Template' },
    //                    ]
    //                  }
    //                ]
    //              }
    //            ]
    //          }
    //        }
    //      ]
    //    }
    return {
      type: "CallExpression",
      callee: createIdentifier(callee),
      arguments,
    };
  }

  // 文本节点转换
  function transformText(node) {
    // 不是文本节点，直接返回
    if (node.type !== "Text") {
      return;
    }

    // 文本节点对应的 JavaScript AST 节点其实就是一个字符串字面量
    node.jsNode = createStringLiteral(node.content);
  }

  // 标签节点转换
  function transformElement(node) {
    // 将转换代码编写在退出阶段的回调函数中，
    // 可以保证该标签节点的子节点全部被处理完毕
    return () => {
      // 如果被转换的节点不是元素节点，则什么都不做
      if (node.type !== "Element") {
        return;
      }

      // 1. 创建 h 函数调用语句
      // h 函数调用的第一个参数是标签名称，因此我们以 node.tag 来创建一个字符串字面量节点
      const callExp = createCallExpression("h", [
        createStringLiteral(node.tag),
      ]);
      // 2.处理 h 函数调用的参数
      node.children.length === 1
        ? // 如果当前节点只有一个子节点，则直接使用子节点的 jsNode 作为参数
          callExp.arguments.push(node.children[0].jsNode)
        : // 多个子节点，创建一个 ArrayExpression 节点作为参数
          callExp.arguments.push(
            // 数组的每个元素都是子节点的 jsNode
            createArrayExpression(node.children.map((c) => c.jsNode))
          );
      // 3. 将当前标签节点对应的 JavaScript AST 添加到 jsNode 属性下
      node.jsNode = callExp;
    };
  }

  // 转换 Root 根节点
  function transformRoot(node) {
    return () => {
      // 如果被转换的节点不是根节点，则什么都不做
      if (node.type !== "Root") {
        return;
      }

      const vnodeJSAST = node.children[0].jsNode;
      // 创建 render 函数的声明语句节点，将 vnodeJSAST 作为 render 函数体的返回语句
      node.jsNode = {
        type: "FunctionDecl",
        id: { type: "Identifier", name: "render" },
        params: [],
        body: [
          {
            type: "ReturnStatement",
            return: vnodeJSAST,
          },
        ],
      };
    };
  }

  function genNode(node, context) {
    switch (node.type) {
      case "FunctionDecl":
        genFunctionDecl(node, context);
        break;
      case "ReturnStatement":
        genReturnStatement(node, context);
        break;
      case "CallExpression":
        genCallExpression(node, context);
        break;
      case "StringLiteral":
        genStringLiteral(node, context);
        break;
      case "ArrayExpression":
        genArrayExpression(node, context);
        break;
    }
  }

  function genFunctionDecl(node, context) {
    // 从 context 对象中取出工具函数
    const { push, indent, deIndent } = context;
    // node.id 是一个标识符，用来描述函数的名称，即 node.id.name
    push(`function ${node.id.name} `);
    push(`(`);
    // 调用 genNodeList 为函数的参数生成代码
    genNodeList(node.params, context);
    push(`) `);
    push(`{`);
    // 缩进
    indent();
    // 为函数体生成代码，这里递归地调用了 genNode 函数
    node.body.forEach((n) => genNode(n, context));
    // 取消缩进
    deIndent();
    push(`}`);
  }

  function genArrayExpression(node, context) {
    const { push } = context;
    // 追加方括号
    push("[");
    // 调用 genNodeList 为数组元素生成代码
    genNodeList(node.elements, context);
    // 补全方括号
    push("]");
  }

  function genReturnStatement(node, context) {
    const { push } = context;
    // 追加 return 关键字和空格
    push(`return `);
    // 调用 genNode 函数递归地生成返回值代码
    genNode(node.return, context);
  }

  function genStringLiteral(node, context) {
    const { push } = context;
    // 对于字符串字面量，只需要追加与 node.value 对应的字符串即可
    push(`'${node.value}'`);
  }

  function genCallExpression(node, context) {
    const { push } = context;
    // 取得被调用函数名称和参数列表
    const { callee, arguments: args } = node;
    // 生成函数调用代码
    push(`${callee.name}(`);
    // 调用 genNodeList 生成参数代码
    genNodeList(args, context);
    // 补全括号
    push(`)`);
  }

  function genNodeList(nodes, context) {
    const { push } = context;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      genNode(node, context);
      if (i < nodes.length - 1) {
        push(", ");
      }
    }
  }

  exports.parse = parse;
  exports.transform = transform;
  exports.generate = generate;

  Object.defineProperty(exports, "__esModule", { value: true });

  return exports;
})({});

// - tips
// -- 深度优先
// --- 回调函数抛出处理
