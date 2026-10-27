# 中台

用于归集个人项目、灵感和近况的轻量工作台。原生 HTML / CSS / ES Modules，无第三方运行依赖。

## 运行

需要 Node.js 20 或更新版本。在本目录运行 `node scripts/serve.mjs`，访问 http://127.0.0.1:4173。`node scripts/check.mjs` 验证脚本及核心数据行为，`node scripts/build.mjs` 生成 dist，无需安装 npm 依赖。

## 目录约定

- `src/layout/`：侧栏、顶栏与页面框架。
- `src/modules/overview/`：总览视图与独立样式。
- `src/modules/projects/`：项目模块。
- `src/modules/ideas/`：灵感模块。
- `src/modules/now/`：近况模块。
- `src/components/`：图标、列表、弹窗等共用界面。
- `src/data/`：浏览器存储与内容转义。
- `src/styles/`：全局视觉变量与基础样式。
- `scripts/`：本地启动、构建和验证。
- `public/`：原样复制到部署根目录的静态文件，包含旧站点 Service Worker 退出脚本。
- `.github/workflows/`：GitHub Pages 验证、构建与部署。

每个模块对外导出 render(records)。模块专属功能和样式放在自己的目录，只有实际复用的实现才提升到公共目录。新增模块时在 app.js 注册路由、layout/shell.js 注册导航。

## 当前范围

已实现响应式框架、四个页面、深浅主题、新增记录与总览同步。初始内容为空；没有虚构项目或统计。记录保存在当前浏览器 localStorage，尚未接入服务端、跨设备同步、附件或编辑删除。主题也保存在本地。后续有持久化需求时，可从 src/data 单独替换数据实现。

## 部署

目标仓库：https://github.com/linzeduan/linzeduan.github.io 。main 分支更新后，GitHub Actions 验证并构建 dist，发布到 https://linzeduan.github.io/ 。仓库与页面公开，浏览器新增记录仍只保存在使用者自己的浏览器，不会写回仓库。

以旧 main 提交 `746c4b6e519ef628fb4a7c7c7ebba6a59ba0bef2` 为父提交完成替换，保留历史，移除旧站点工作文件。旧站点历史分支、标签及仓库外服务不受影响。域名改变后，原 Sites 域名下的浏览器记录不会自动迁移。
