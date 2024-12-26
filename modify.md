## 准备工作
1. 安装 Git
```
yum install -y git
```

2. 安装 npm
```
yum install -y npm
```

3. 安装 pnpm
```
npm install -g pnpm
```

4. 安装 chromium
```
yum install -y chromium
```


## 第1步：获取代码

使用以下命令克隆 markmap 仓库：

```angular2html
git clone https://github.com/wxaiway/markmap.git 
```

进入项目目录：
```angular2html
cd markmap
```

## 第2步：安装依赖
使用以下命令安装依赖：
```angular2html
pnpm install
```

## 第3步：编译项目 使用以下命令编译项目：
```angular2html
pnpm run build
```

##  第4步：测试现有功能  使用以下命令测试现有功能：

创建一个测试用的 Markdown 文件，例如 test.md，内容如下：
```markdown
---
title: markmap
markmap:
  colorFreezeLevel: 2
---

## Links

- [Website](https://markmap.js.org/)
- [GitHub](https://github.com/gera2ld/markmap)

## Related Projects

- [coc-markmap](https://github.com/gera2ld/coc-markmap) for Neovim
- [markmap-vscode](https://marketplace.visualstudio.com/items?itemName=gera2ld.markmap-vscode) for VSCode
- [eaf-markmap](https://github.com/emacs-eaf/eaf-markmap) for Emacs

## Features

Note that if blocks and lists appear at the same level, the lists will be ignored.

### Lists

- **strong** ~~del~~ *italic* ==highlight==
- `inline code`
- [x] checkbox
- Katex: $x = {-b \pm \sqrt{b^2-4ac} \over 2a}$ <!-- markmap: fold -->
  - [More Katex Examples](#?d=gist:af76a4c245b302206b16aec503dbe07b:katex.md)
- Now we can wrap very very very very long text based on `maxWidth` option
- Ordered list
  1. item 1
  2. item 2

### Blocks

console.log('hello, JavaScript')

| Products | Price |
|-|-|
| Apple | 4 |
| Banana | 2 |

```

运行以下命令生成 HTML 格式的思维导图：
```angular2html
node packages/markmap-cli/bin/cli.js test.md -o output.html --no-open --no-toolbar --offline
```

运行以下命令生成 PNG 格式的思维导图：
```angular2html
node packages/markmap-cli/bin/cli.js test.md -o output.png --no-open --no-toolbar --offline
```

## 注意

### 格式化
文件修改需要执行以下命令格式化
```angular2html
npx prettier --write xxx

```

### 处理异常
清除 npm 缓存：
```angular2html
npm cache clean --force
```

删除 node_modules 目录和 package-lock.json 文件：
```angular2html
rm -rf node_modules package-lock.json
```

