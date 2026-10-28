# 项目执行约定

- 保持原生 HTML / CSS / ES Modules 和静态 GitHub Pages 发布方式。最新视觉方向为现代 3D 房间入口与个人花园式内容排版，保留清晰的 iOS 操作习惯。进入内容后，仅通过“回到房间”按钮返回场景，鼠标越过屏幕边缘不得触发退出。
- 健康、投资、学习及原有账本数据必须兼容；不可读取的旧数据不能覆盖。私人数据、备份、浏览器存储和 QA 产物不能提交到公共仓库。
- 用户已授权：每次修改完成并验证通过后，直接发布到 `linzeduan/linzeduan.github.io` 的 `main`，无需重复确认。保留远端并发改动，不强制推送。
- 开发修改运行 `node scripts/check.mjs`、`node scripts/build.mjs` 及与改动相关的浏览器验证；发布后确认 GitHub Actions 成功，并检查线上页面。
