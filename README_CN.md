# SlideSmith

**用 HTML 锻造可编辑的 PowerPoint 文件。**

一行命令把 HTML + CSS 变成可编辑的 `.pptx` 文件——文字还是文字，形状还是形状，渐变和阴影都保留。不上传云端，不限页数，不花钱。

```bash
git clone https://github.com/AliceLJY/slidesmith.git && cd slidesmith && npm install
node bin/cli.mjs presentation.html
```

> **本地跑** —— clone 下来直接用，不发 npm。（npm 上的 `slidesmith` 是另一个无关的包，别 `npm i slidesmith`。）

## 为什么做这个？

| | SlideSmith | SaaS 转换工具 | 截图贴 PPT |
|---|---|---|---|
| 文字可编辑 | 是 | 是 | 否（变成图片） |
| 页数限制 | 无限 | 5-50 页 | 无限 |
| 费用 | 免费 | ¥70-700/月 | 免费 |
| 数据隐私 | 100% 本地 | 上传云端 | 100% 本地 |
| CSS 支持 | Flexbox、Grid、渐变 | 因平台而异 | 全部（反正是图片） |

## 原理

1. **本地 HTTP 服务器** 托管 HTML 和资源文件（图片、字体）
2. **无头浏览器**（Playwright）渲染 HTML，利用真实的浏览器排版引擎处理 flexbox/grid 布局
3. **[dom-to-pptx](https://github.com/atharva9167j/dom-to-pptx)** 遍历渲染后的 DOM，读取每个元素的最终位置和样式，映射为 PPTX 原生对象（通过 [PptxGenJS](https://github.com/gitbrent/PptxGenJS)）
4. 输出：真正的 `.pptx` 文件，在 PowerPoint、Keynote、Google Slides 中均可编辑

核心洞察：浏览器的排版引擎已经帮你算好了所有布局，我们只是读取最终结果。

**两种模式。** 默认输出**可编辑**的 PPTX（文字仍是文字）。遇到可编辑路径无法翻译的复杂 CSS，加 `--screenshots` 把每页截成像素级精确（但不可编辑）的 2x 图片；而且一旦可编辑转换失败，SlideSmith 会自动降级到截图模式——绝不会给你一个空文件。

## 快速开始

### Clone 下来跑

```bash
git clone https://github.com/AliceLJY/slidesmith.git
cd slidesmith
npm install
node bin/cli.mjs my-slides.html
```

> 想要一个短的 `slidesmith` 命令？在仓库里跑一次 `npm link`，它会软链接一个本地 `slidesmith` 命令供你全局调用。不发布到 npm；下文命令默认你已经 `npm link` 过（否则就用 `node bin/cli.mjs`）。

### 首次使用

SlideSmith 会优先使用你系统里已安装的 Chrome。如果没有可用的浏览器：

```bash
npx playwright install chromium
```

## 用法

```bash
# 基本用法 — 在当前目录输出 my-slides.pptx
slidesmith my-slides.html

# 自定义输出路径
slidesmith deck.html -o ~/Desktop/presentation.pptx

# 跳过字体嵌入（更快、文件更小）
slidesmith deck.html --no-fonts

# 截图模式 — 像素级精确、不可编辑（适合复杂 CSS）
slidesmith deck.html --screenshots

# 安静模式
slidesmith deck.html -q
```

## HTML 编写规范

每页 slide 用 `class="slide"` 标记，设定明确的宽高：

```html
<div class="slide" style="width: 1920px; height: 1080px; padding: 80px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  font-family: Arial, sans-serif; color: white;
  display: flex; flex-direction: column; justify-content: center;">

  <h1 style="font-size: 72px;">标题写这里</h1>
  <p style="font-size: 28px; margin-top: 20px;">这段文字在 PowerPoint 里可以直接编辑。</p>
</div>
```

### 支持的 CSS 属性

- **布局**: `display: flex`, `display: grid`, `position: absolute/relative`, `gap`
- **背景**: `background-color`, `linear-gradient()`, `background-image`（URL/base64）
- **边框**: `border`, `border-radius`（含单角设置）
- **阴影**: `box-shadow`（单个和多个）
- **字体**: `font-family`, `font-size`, `font-weight`, `color`, `text-align`, `line-height`, `letter-spacing`
- **变换**: `rotate()`（translate/scale 暂不支持）
- **其他**: `opacity`, `padding`, `filter: blur()`

### 图片

相对路径、绝对 URL、base64 data URI 都可以用。相对路径相对 HTML 文件所在目录解析（转换时由本地 server 服务），引用的资源放在该目录或其子目录里即可：

```html
<!-- 都可以 -->
<img src="./photo.jpg" />
<img src="assets/logo.png" />
<img src="https://example.com/photo.jpg" style="width: 400px;" />
<img src="data:image/png;base64,..." />

<!-- 不行：超出 HTML 文件所在目录 -->
<img src="../elsewhere/photo.jpg" />
```

### 安全提示

**只转换你信任的 HTML。** SlideSmith 会在真实的 headless 浏览器里渲染 HTML 并执行其中的脚本（可联网）。不要喂不可信的页面。

## 示例模板

`examples/` 目录包含几个现成的模板：

- **`minimal.html`** — 单页最简示例
- **`pitch-deck.html`** — 5 页路演 deck，含渐变、卡片和表格
- **`data-dashboard.html`** — KPI 卡片和 CSS 柱状图

试试看：

```bash
node bin/cli.mjs examples/pitch-deck.html -o pitch-deck.pptx
```

## 编程接口

```javascript
import { convert } from './lib/converter.mjs';

const result = await convert('slides.html', 'output.pptx', {
  quiet: false,
  autoEmbedFonts: true,
  mode: 'editable',   // 或 'screenshots'（像素级精确、不可编辑）
  fallback: true,     // 可编辑转换失败时自动降级截图
});

console.log(`${result.slideCount} 页, ${result.fileSize} 字节`);
```

## 致谢

SlideSmith 是一层薄薄的 CLI 封装，真正干活的是：

- **[dom-to-pptx](https://github.com/atharva9167j/dom-to-pptx)** — DOM 遍历和 PPTX 元素映射
- **[PptxGenJS](https://github.com/gitbrent/PptxGenJS)** — PowerPoint 文件生成
- **[Playwright](https://playwright.dev/)** — 无头浏览器渲染

## 许可证

[MIT](LICENSE)
