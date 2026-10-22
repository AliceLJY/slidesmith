# SlideSmith 与 scenecast：把 HTML 变成 PPT 和视频

> 状态：SlideSmith v1.1.0、scenecast v0.1.0（两个版本都发于 2026 年 7 月 17 日），本地命令行工具，clone 下来跑，不发 npm。开源，MIT 协议。两个都还能用：SlideSmith 定位是低频备用工具，scenecast 自 7 月中旬后没再改动。
> 入口：[SlideSmith](https://github.com/AliceLJY/slidesmith) · [scenecast](https://github.com/AliceLJY/scenecast) · [SlideSmith Vision](https://github.com/AliceLJY/slidesmith-vision)（2026-10-22 已归档）

## 它解决什么

我让 AI 做东西，最顺手的产出格式是 HTML，配色、排版、字体全在里面。可是别人要的是 PPT，公众号周报要的是视频。把 HTML 变成这两样，市面上的路都别扭：在线转 PPT 的工具免费版限页数、文件要上传；HTML 转视频的工具要么整页翻页像放幻灯片，要么把你绑进它的模板系统，视频长得不像你的页面。

SlideSmith 管 PPT：一行命令，把 HTML 幻灯片映射成 PowerPoint 原生对象，文字还是文字、形状还是形状，到 PowerPoint 和 Keynote 里都能改。scenecast 管视频：给页面里的元素加上 `data-anim` 属性，它按虚拟时钟逐帧定格、截图，再用 ffmpeg 编码成 MP4，视频和你的 HTML 长得一模一样，只是动了。两个都在本地跑，不上传、不限页数、不花钱。

## 它长什么样

SlideSmith 的 README 首屏有一张 HTML 与 PPTX 的对照图（2026-10 补）。整理这页时我用仓库自带的 5 页示例跑了一遍：2.4 秒出一份 3.43 MB 的 pptx，解开看，5 页里一共 57 段原生文本，封面标题「SlideSmith」就是可编辑文字。

scenecast 的演示是仓库自带的 demo 渲的，三个场景 14 秒：封面文字滑入、右下角数字从 0 滚到 60；第二页三张卡片错时入场；结尾一句话里「HTML」变蓝，下面一条蓝线描边画出来。

![scenecast 演示：三个场景，文字滑入、数字滚动、卡片错时入场、下划线描边](https://raw.githubusercontent.com/AliceLJY/scenecast/main/demo/demo.gif)

## 起点

SlideSmith 先来。2026 年 4 月中，我本来想用一个在线的 HTML 转 PPT 服务，免费版限页数、文件要上传。查到它底层用的是开源库 dom-to-pptx，就决定自己包一个本地命令行：用无头浏览器把 HTML 渲出来，让浏览器的排版引擎算好每个元素的位置，再读最终结果映射成 PPTX 对象。核心洞察就一句：布局浏览器已经算完了，我只是读结果。所以它是薄薄一层封装，加上命令行总共不到六百行，真正干活的是 dom-to-pptx、PptxGenJS 和 Playwright。

scenecast 是 6 月初从周报管线里抽出来的。那时周报已经是「数据到 HTML 到视频」的流水线，可视频那一步是另一套方案，结果视频和 HTML 的风格对不上，动画脚本还是硬编码的，维护起来费劲。我拍板把「HTML 转视频」抽成独立开源库，放进 Projects 目录，下一周的周报直接切换过去。它 README 第一句就是立场：HTML 始终是唯一视觉源，不套模板、不绑前端框架。

两个仓不是上下游，是姊妹：同一套「浏览器渲染 HTML」的路子，一个往 PPT 走，一个往视频走。6 月 11 日一起审过一轮，6 月 20 日两边的功能提交出自同一个会话。另有一个 SlideSmith Vision 仓，位于上游：它自己不做识别，只把视觉重建得到的 spec 校验后转成 SlideSmith 能吃的 HTML。

## 几个关键取舍

- **不发 npm，clone 下来跑。** npm 上 slidesmith 和 scenecast 两个名字都被别人的无关包占了，不是恶意占名，争不回；照旧 README 的 `npx slidesmith` 会装错包。所以两个仓都改成 git clone 后 `node bin/cli.mjs` 运行，`package.json` 加 `private: true` 防误发布。
- **可编辑优先，截图兜底，但要说清最后走了哪条路。** 遇到可编辑路径翻译不了的 CSS，SlideSmith 自动降级成每页一张 2 倍截图，能用但不可编辑，命令行结束时明确打出最终模式。降级路径是临时卸掉依赖包验证过的，不是写了就算。
- **动画是「定位」，不是「录屏」。** scenecast 的动画引擎跑在页面里，渲染第 t 秒是 t 的纯函数，逐帧截图，帧级可复现；你 CSS 里原有的过渡和 keyframes 不会被录进去，动效只来自 `data-anim`。代价是要按它的方式声明动画，好处是渲一百遍结果一样。
- **静默劣化要告警。** SlideSmith 转完给每页算指纹，相邻两页完全一样就提示「可能重复或丢内容」，字体没加载上也提示。scenecast 逐帧算哈希，一个场景声明了动画却所有帧相同，就告警「动画可能没在跑」，而不是悄悄交出一段静止画面。
- **低频备用工具，不做成 skill。** 6 月 11 日审计完我定的位：有 PPT 需求但不多，要备着随时能用。不接周报管线、不做定时巡检，低频工具过度建设等于闲置建设。

## 怎么做出来的

两个项目都通过 AI 协作完成。SlideSmith 从 2026 年 4 月 15 日到 9 月 6 日 11 次提交、2 个版本号；scenecast 从 6 月 7 日到 7 月 19 日 6 次提交、1 个版本号。6 月 11 日做过一轮两个 AI 交叉审读的审计；7 月 17 日的 v1.1.0 和 v0.1.0 出自一次全仓库体检。我做的是拍板定位、决定周报切换。

## 踩过的坑

- **文档比代码悲观。** README 曾写着「相对路径的图片不行」，6 月 11 日实测相对路径的图片好好地嵌进了 pptx，错的是文档；真正的规则是资源要放在 HTML 所在目录之下。
- **stdout 说成功，磁盘上什么都没有。** 用 scenecast 渲周报视频时，脚本汇报「rendered 6 scenes」，去看 mp4 根本没生成：渲染要用系统 Chrome 显示中文字体，而沙箱挡住了浏览器启动。从此核验只看 ls 和 ffprobe 的真实字节，不读脚本自报的成功。
- **选择器跟着 HTML 漂。** 周报适配器给每张卡写死了 CSS 选择器再注入 `data-anim`，6 月 14 日周报 HTML 整片重写，34 个选择器 19 个没命中，动效静默丢失。改 HTML 必须同步改选择器，探针验到 0 个未命中再渲。
- **依赖告警来了却没版本可升。** 9 月 6 日 CI 突然红：一条 9 月 2 日发布的 xmldom 告警，锁文件升一版就好；另一条 image-size 的告警覆盖到它的最新版，没得升，只能把 CI 的审计门槛放宽到 critical，等上游修。

## 现在的边界

- 目前只有我自己在用。
- SlideSmith 的渐变背景会被上游库导成位图：那份 5 页示例 3.43 MB，大头是两张 1.5 MB 的背景图。`translate` 和 `scale` 变换不支持；它会在真实浏览器里执行 HTML 里的脚本，只转信任的 HTML。自带测试只验 pptx 结构和页数，可编辑性是我这次手工解包核的。
- scenecast 渲过 5 月底到 6 月底四期周报视频，6 月底之后周报改成只出图卡，视频这一步就没再跑；代码自 7 月 19 日后没动。行内元素做位移动画会被提升成 inline-block，可能改变换行；嵌套的错时入场不支持；要本机装 ffmpeg 和 Playwright 浏览器。
- SlideSmith Vision 只管 spec 到 HTML 这一段，图片识别不在它里面。

## 入口

- 代码与文档：[github.com/AliceLJY/slidesmith](https://github.com/AliceLJY/slidesmith) · [github.com/AliceLJY/scenecast](https://github.com/AliceLJY/scenecast) · [github.com/AliceLJY/slidesmith-vision](https://github.com/AliceLJY/slidesmith-vision)（2026-10-22 已归档）
- 作者：小试AI，公众号「我的AI小木屋」

本页截至 SlideSmith v1.1.0 / scenecast v0.1.0，2026 年 9 月 8 日整理。
