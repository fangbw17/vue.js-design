var Compiler = (function (exports) {
  // 定义文本模式，作为一个状态表
  const TextModes = {
    DATA: "DATA",
    RCDATA: "RCDATA",
    RAWTEXT: "RAWTEXT",
    CDATA: "CDATA",
  };
  // html 语法标记枚举
  const State = {
    initial: 1,
    tagBegin: 2,
    tagName: 3,
    text: 4,
    tagEnd: 5,
    tagEndName: 6,
  };

  const namedCharacterReferences = {
    gt: ">",
    "gt;": ">",
    lt: "<",
    "lt;": "<",
    "ltcc;": "⪦",
  };

  const CCR_REPLACEMENTS = {
    0x80: 0x20ac,
    0x82: 0x201a,
    0x83: 0x0192,
    0x84: 0x201e,
    0x85: 0x2026,
    0x86: 0x2020,
    0x87: 0x2021,
    0x88: 0x02c6,
    0x89: 0x2030,
    0x8a: 0x0160,
    0x8b: 0x2039,
    0x8c: 0x0152,
    0x8e: 0x017d,
    0x91: 0x2018,
    0x92: 0x2019,
    0x93: 0x201c,
    0x94: 0x201d,
    0x95: 0x2022,
    0x96: 0x2013,
    0x97: 0x2014,
    0x98: 0x02dc,
    0x99: 0x2122,
    0x9a: 0x0161,
    0x9b: 0x203a,
    0x9c: 0x0153,
    0x9e: 0x017e,
    0x9f: 0x0178,
  };

  /**
   * @description: 解析器函数，接收模板作为参数
   * @param {String} 模板
   * @return {Object} AST 模板
   */
  function parse(str) {
    // 定义上下文对象
    const context = {
      // source 是模板内容，用于在解析过程中消费
      source: str,
      // 解析器当前处于文本模式，初始模式为 DATA
      mode: TextModes.DATA,
      // advanceBy 函数用来消费指定数量的字符，它接收一个数字作为参数
      advanceBy(length) {
        // 截取位置 length 后的模板内容，并替换当前模板内容
        context.source = context.source.slice(length);
      },
      // 无论开始标签还是结束标签，都可能存在无用的空白字符，例如 <div >
      advanceSpaces() {
        // 匹配空白字符
        const match = /^[\t\r\n\f ]+/.exec(context.source);
        if (match) {
          context.advanceBy(match[0].length);
        }
      },
    };

    // 参数二：由父代节点构成节点栈，初始时栈为空
    const nodes = parseChildren(context, []);

    return {
      type: "Root",
      children: nodes,
    };
  }

  function isEnd(context, ancestors) {
    // 模板解析完成
    if (!context.source) return true;
    // 获取节点栈中最新的节点
    const curNode = ancestors[ancestors.length - 1];
    for (let i = ancestors.length - 1; i >= 0; --i) {
      // 如果当前节点存在，且模板以当前节点的结束标签起始，则跳出当前循环
      if (context.source.startsWith(`</${ancestors[i].tag}`)) {
        return true;
      }
    }
    return false;
  }

  function parseChildren(context, ancestors) {
    // 定义 nodes 数组存储子节点，将作为最终的返回值
    let nodes = [];
    // 从上下文对象中取得当前状态，包括模式 mode 和模板内容 source
    const { source, mode } = context;

    while (!isEnd(context, ancestors)) {
      let node;
      // 只有 DATA 模式和 RCDATA 模式才支持插值节点的解析
      if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
        // 只有 DATA 模式才支持标签节点的解析
        if (mode === TextModes.DATA && source[0] === "<") {
          if (source[1] === "!") {
            // 以注释为起始的
            if (source.startsWith("<!--")) {
              // 解析注释
              node = parseComment(context);
            } else if (source.startsWith("<![CDATA[")) {
              // CDATA
              node = parseCDATA(context, ancestors);
            }
          } else if (source[1] == "/") {
            // 结束标签
            console.error("无效的结束标签");
            continue;
          } else if (/[a-z]/i.test(source[1])) {
            // 标签
            node = parseElement(context, ancestors);
          }
        } else if (source.startsWith("{{")) {
          // 插值
          node = parseInterpolation(context);
        }
      }

      // node 不存在，说明处于其他模式
      // 当做文本处理
      if (!node) {
        node = parseText(context);
      }

      // 添加节点
      nodes.push(node);
    }
    return nodes;
  }

  // 解析元素
  function parseElement(context, ancestors) {
    const element = parseTag(context);
    if (element.isSelfClosing) return element;

    // 切换到正确的文本模式
    if (element.tag === "textarea" || element.tag === "title") {
      // 如果是 textarea，或者 title，则切换到 RCDATA
      context.mode = TextModes.RCDATA;
    } else if (/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
      // 切换到 RAWTEXT 模式
      context.mode = TextModes.RAWTEXT;
    } else {
      // 切换到 DATA 模式
      context.mode = TextModes.DATA;
    }

    ancestors.push(element);
    element.children = parseChildren(context, ancestors);
    ancestors.pop();

    if (context.source.startsWith(`</${element.tag}`)) {
      parseTag(context, "end");
    } else {
      console.error(`${element.tag} 标签缺少闭合标签`);
    }

    return element;
  }

  // 解析标签
  function parseTag(context, type = "start") {
    const { advanceBy, advanceSpaces } = context;
    const match =
      type === "start"
        ? // 匹配开始
          /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
        : // 匹配结束
          /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source);
    // 匹配成功后，正则表达式的第一个捕获组的值就是标签名称
    const tag = match[1];
    // 消费正则表达式匹配的全部内容，’<div‘
    advanceBy(match[0].length);
    // 消费标签中无用的空白字符
    advanceSpaces();

    // 解析属性与指令
    const props = parseAttributes(context);

    // 匹配结束标签的闭合部分
    const isSelfClosing = context.source.startsWith("/>");
    // > or />
    advanceBy(isSelfClosing ? 2 : 1);

    return {
      type: "Element",
      tag,
      props,
      children: [],
      isSelfClosing,
    };
  }

  // 解析属性与指令
  function parseAttributes(context) {
    // 用来存储解析过程中产生的属性和指令
    const props = [];

    while (
      !context.source.startsWith(">") &&
      !context.source.startsWith("/>")
    ) {
      // 该正则用于匹配属性名称
      const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source);
      // 得到属性名称
      const name = match[0];
      // 消费属性名称
      advanceBy(name.length);
      // 消费属性名称与等于号之间的空白字符
      advanceSpaces();
      // 消费等于号
      advanceBy(1);
      // 消费等于号与属性值之间的空白字符
      advanceSpaces();

      // 属性值
      let value = "";
      // 获取当前模板内容的第一个字符
      const quote = context.source[0];
      // 判断属性值是否被引号引用
      const isQuoted = quote === '"' || quote === "'";

      if (isQuoted) {
        // 去除左引号
        advanceBy(1);
        // 查找右引号下标
        const endQuoteIndex = context.source.indexOf(quote);
        if (endQuoteIndex > -1) {
          value = context.source.slice(0, endQuoteIndex);
          // 消费属性值
          advanceBy(value.length);
          // 消费右引号
          advanceBy(1);
        } else {
          // 未找到右引号，抛出错误
          console.error("缺少右引号");
        }
      } else {
        // 属性值没有被引号引用
        // 下一个空白字符之前的内容全部作为属性值
        const match = /^[^\t\r\n\f >]+/.exec(context.source);
        // 获取属性值
        value = match[0];
        // 消费属性值
        advanceBy(value.length);
      }
      // 消费属性值后面的空白字符
      advanceSpaces();

      props.push({
        type: "Attribute",
        name,
        value,
      });
    }
    return props;
  }

  // 解析文本
  function parseText(context) {
    let endIndex = context.source.length;
    // 查找 < 的位置索引
    const ltIndex = context.source.indexOf("<");
    // 查找 {{ 的位置索引
    const delimiterIndex = context.source.indexOf("{{");

    // text</div>
    if (ltIndex > -1 && endIndex > ltIndex) {
      endIndex = ltIndex;
    }
    // text-{{info}}</div>
    if (delimiterIndex > -1 && endIndex > delimiterIndex) {
      endIndex = delimiterIndex;
    }

    const content = context.source.slice(0, endIndex);
    content.advanceBy(content.length);

    return {
      type: "Text",
      content: decodeHtml(content),
    };
  }

  // 第一个参数为要被解码的文本内容
  // 第二个参数是一个布尔值，代表文本内容是否作为属性值
  function decodeHtml(rawText, asAttr = false) {
    let offset = 0;
    const end = rawText.length;
    // 经过解码后的文本将作为返回值被返回
    let decodedText = "";
    // 引用表中实体名称的最大长度
    let maxCRNameLength = 0;

    // advance 函数用于消费指定长度的文本
    function advance(length) {
      offset += length;
      rawText = rawText.slice(length);
    }

    // 消费字符串，直到处理完毕为止
    while (offset < end) {
      // 用于匹配字符引用的开始部分，如果匹配成功，那么 head[0] 的值将有三种可能：
      // 1. head[0] === '&'，这说明该字符引用是命名字符引用
      // 2. head[0] === '&#'，这说明该字符引用是用十进制表示的数字字符引用
      // 3. head[0] === '&#x'，这说明该字符引用是用十六进制表示的数字字符引用
      const head = /&(?:#x?)?/i.exec(rawText);
      // 如果没有匹配，说明已经没有需要解码的内容了
      if (!head) {
        // 计算剩余内容的长度
        const remaining = end - offset;
        // 将剩余内容加到 decodedText 上
        decodedText += rawText.slice(0, remaining);
        // 消费剩余内容
        advance(remaining);
        break;
      }

      // head.index 为匹配的字符 & 在 rawText 中的位置索引
      // 截取字符 & 之前的内容加到 decodedText 上
      decodedText += rawText.slice(0, head.index);
      // 消费字符 & 之前的内容
      advance(head.index);

      // 如果满足条件，则说明是命名字符引用，否则为数字字符引用
      if (head[0] === "&") {
        let name = "";
        let value;
        // 字符 & 的下一个字符必须是 ASCII 字母或数字，这样才是合法的命名字符引用
        if (/[0-9a-z]/i.test(rawText[1])) {
          // 根据引用表计算实体名称的最大长度，
          if (!maxCRNameLength) {
            maxCRNameLength = Object.keys(namedCharacterReferences).reduce(
              (max, name) => Math.max(max, name.length),
              0
            );
          }
          // 从最大长度开始对文本进行截取，并试图去引用表中找到对应的项
          for (let length = maxCRNameLength; !value && length > 0; --length) {
            // 截取字符 & 到最大长度之间的字符作为实体名称
            name = rawText.substr(1, length);
            // 使用实体名称去索引表中查找对应项的值
            value = namedCharacterReferences[name];
          }
          // 如果找到了对应项的值，说明解码成功
          if (value) {
            // 检查实体名称的最后一个匹配字符是否是分号
            const semi = name.endsWith(";");
            // 如果解码的文本作为属性值，最后一个匹配的字符不是分号，
            // 并且最后一个匹配字符的下一个字符是等于号（=）、ASCII 字母或数字，
            // 由于历史原因，将字符 & 和实体名称 name 作为普通文本
            if (
              asAttr &&
              !semi &&
              /[=a-z0-9]/i.test(rawText[name.length + 1] || "")
            ) {
              decodedText += "&" + name;
              advance(1 + name.length);
            } else {
              // 其他情况下，正常使用解码后的内容拼接到 decodedText 上
              decodedText += value;
              advance(1 + name.length);
            }
          } else {
            // 如果没有找到对应的值，说明解码失败
            decodedText += "&" + name;
            advance(1 + name.length);
          }
        } else {
          // 如果字符 & 的下一个字符不是 ASCII 字母或数字，则将字符 & 作为普通文本
          decodedText += "&";
          advance(1);
        }
      } else {
        // 判断是以十进制标识还是以十六进制标识
        const hex = head[0] === "&#x";
        // 根据不同进制表示法，选用不同的正则
        const pattern = hex ? /^&#x([0-9a-f]+);?/i : /^&#([0-9]+);?/;
        const body = pattern.exec(rawText);

        if (body) {
          // 根据对应的进制，将码点字符串转换为数字
          const cp = parseInt(body[1], hex ? 16 : 10);
          // 检查码点的合法性
          if (cp === 0) {
            // 如果码点值为 0x00，替换为 0xfffd
            cp = 0xfffd;
          } else if (cp > 0x10ffff) {
            // 如果码点值超过 Unicode 的最大值，替换为 0xfffd
            cp = 0xfffd;
          } else if (cp >= 0xd800 && cp <= 0xdfff) {
            // 如果码点值处于 surrogate pair 范围内，替换为 0xfffd
            cp = 0xfffd;
          } else if (
            (cp >= 0xfdd0 && cp <= 0xfdef) ||
            (cp & 0xfffe) === 0xfffe
          ) {
            // 如果码点值处于 noncharacter 范围内，则什么都不做，交给平台处理
            // noop
          } else if (
            // 控制字符集的范围是：[0x01, 0x1f] 加上 [0x7f, 0x9f]
            // 去掉 ASICC 空白符：0x09(TAB)、0x0A(LF)、0x0C(FF)
            // 0x0D(CR) 虽然也是 ASICC 空白符，但需要包含
            (cp >= 0x01 && cp <= 0x08) ||
            cp === 0x0b ||
            (cp >= 0x0d && cp <= 0x1f) ||
            (cp >= 0x7f && cp <= 0x9f)
          ) {
            // 在 CCR_REPLACEMENTS 表中查找替换码点，如果找不到，则使用原码点
            cp = CCR_REPLACEMENTS[cp] || cp;
          }
          // 最后进行解码
          decodedText += String.fromCodePoint(cp);
          advance(body[0].length)
        } else {
          // 如果没有匹配，则不进行解码操作，只是把 head[0] 追加到 decodedText 上
          decodedText += head[0]
          advance(head[0].length)
        }
      }
    }
    return decodedText;
  }

  // 解析插值
  function parseInterpolation(context) {
    // 消费开始定界符
    context.advanceBy('{{'.length)
    // 找到结束定界符的位置索引
    const closeIndex = context.source.indexOf('}}')
    if (closeIndex < 0) {
      console.error('插值缺少结束定界符')
    }
    const content = context.source.slice(0, closeIndex)
    content.advanceBy(content.length)
    context.advanceBy('}}'.length)

    return {
      type: 'Interpolation',
      content: {
        type: 'Expression',
        content: decodeHtml(content)
      }
    }
  }

  // 解析注释
  function parseComment(context) {
    context.advanceBy('<!--'.length)
    const closeIndex = context.source.indexOf('-->')
    if (closeIndex < 0) {
      console.error('注释符不对')
    }
    const content = context.source.slice(0, closeIndex)
    content.advanceBy(content.length)
    context.advanceBy('-->'.length)
    return {
      type: 'Comment',
      content
    }
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
