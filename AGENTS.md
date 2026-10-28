# 项目执行约定

- 保持原生 HTML / CSS / ES Modules、现有 iOS 风格和静态 GitHub Pages 发布方式。
- 健康、投资、学习及原有账本数据必须兼容；不可读取的旧数据不能覆盖。私人数据、备份、浏览器存储和 QA 产物不能提交到公共仓库。
- 用户已授权：每次修改完成并验证通过后，直接发布到 `linzeduan/linzeduan.github.io` 的 `main`，无需重复确认。保留远端并发改动，不强制推送。
- 开发修改运行 `node scripts/check.mjs`、`node scripts/build.mjs` 及与改动相关的浏览器验证；发布后确认 GitHub Actions 成功，并检查线上页面。
