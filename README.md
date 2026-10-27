# 中台 · 一个人的林地

围绕健康、投资、学习的个人生活中台。原生 HTML / CSS / ES Modules，无第三方运行依赖。

## 运行

需要 Node.js 20 或更新版本。在本目录运行 `node scripts/serve.mjs`，访问 http://127.0.0.1:4173。
`node scripts/check.mjs` 验证代码与数据行为，`node scripts/build.mjs` 生成 dist，无需安装 npm 依赖。

## 页面与功能

- 总览：三个主题入口、今日小事、原则阅读入口、最近记录。
- 健康：运动、睡眠和身体感受的文字记录。
- 投资：决策依据与复盘，连接原有投资纪律。
- 学习：阅读、练习、思考笔记，连接原有人生信念。
- 我的原则：人生信念和投资纪律的原生阅读页，支持章节跳转、随机阅读、复制和打印。

所有新记录和今日勾选保存在当前浏览器，不跨设备同步；每日勾选按上海时区重置。健康、投资和学习记录使用原存储键，旧项目、灵感和近况数据保留但不再展示。无法读取的存储不会在新增时被覆盖。

“富裕人生”暂时隐藏，账本代码及原有存储保留；不提供当前页面入口。原始 HTML 在工作区“源文件”中，未修改、未嵌入页面。

## 目录

`src/layout/` 页面框架；`src/modules/overview/` 首页；`src/modules/domains/` 三个主题；
`src/modules/systems/` 原则阅读；`src/components/` 图标、记录与每日勾选；
`src/data/` 浏览器存储；`src/styles/` 全局样式。

## 视觉约定

深绿导航、浅色内容区与三种主题色组成完整界面。首页使用林地 SVG 封面；主题页使用记录主栏与辅助阅读栏；长文使用带当前章节标识的阅读目录。手机底部导航可直接切换主页面。

记录弹窗支持分类切换和保存反馈，长记录可展开全文。今日小事的完成环只展示实际勾选。主题在首次加载时恢复；菜单抽屉支持键盘焦点和 Escape 关闭。

颜色、字体、组件与响应式约定见 [docs/UI.md](docs/UI.md)。全部插画与图标为原生 SVG，无远程字体、图片或 CDN 依赖。

## 验证与部署

`node scripts/check.mjs` 覆盖数据保留、异常存储保护、按日重置、内容转义与原有阅读及账本模型。
`scripts/browser-check.mjs` 用 Playwright 实际检查三类记录、刷新持久化、今日勾选、阅读、深色和移动端。可通过 PLAYWRIGHT_MODULE、BROWSER_CHANNEL、QA_DIR 设置浏览器环境。

现有发布目标是 https://github.com/linzeduan/linzeduan.github.io ，main 更新后由 GitHub Actions 构建并发布至 https://linzeduan.github.io/ 。不使用遗留 .openai/hosting.json 重新创建 Sites 站点。浏览器记录不会上传到仓库。
