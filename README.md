# 中台 · 个人生活系统

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

## 视觉与交互

采用 iOS 风格的简约界面：银白与石墨、系统无衬线字体、透明浮动导航、三个主题强调色。首页焦点球反映今日真实完成数量。

共享卡片展开、弹性导航底板、按钮原点弹窗、完成粒子与进度环、主题圆形揭幕由原生 CSS 和 Web Animations 实现。支持减少动态效果和浏览器 API 回退，不引入第三方运行依赖。

视觉与动效的具体约定见 [docs/UI.md](docs/UI.md)。

## 验证与部署

`node scripts/check.mjs` 覆盖数据保留、异常存储保护、按日重置、内容转义与原有阅读及账本模型。
`scripts/browser-check.mjs` 用 Playwright 实际检查三类记录、刷新持久化、今日勾选、阅读、深色和移动端。可通过 PLAYWRIGHT_MODULE、BROWSER_CHANNEL、QA_DIR 设置浏览器环境。

现有发布目标是 https://github.com/linzeduan/linzeduan.github.io ，main 更新后由 GitHub Actions 构建并发布至 https://linzeduan.github.io/ 。不使用遗留 .openai/hosting.json 重新创建 Sites 站点。浏览器记录不会上传到仓库。

运行 `node scripts/check-motion.mjs` 可额外验证动效中断、弹窗焦点、触屏减少动态效果和 API 回退，环境变量与浏览器测试相同。
