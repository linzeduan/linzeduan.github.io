# 答案之间 Between Answers

我们各自回答人生，也在答案之间慢慢认识彼此。

两位朋友的私人问答 PWA。当前开发版本 **0.2.2-local** 已提供本机双账号、SQLite 持久保存与服务端双向解锁。云端配置按用户要求后置，尚不能让两台异地手机同步。GitHub Pages 仍为合成数据演示，不能作为私人记录服务。

## 本地运行

需要 Node >=24、pnpm 11.25.0。当前工作区已安装依赖，可以直接双击 `启动本地版.cmd`，或运行：

```sh
node scripts/local-dev.mjs
```

打开 http://127.0.0.1:5173 ，首次设置 A、B 的称呼和各自密码。用普通窗口与无痕窗口分别登录、创建空间并通过邀请码绑定。数据存于 `.local/between-answers.sqlite`，已排除 Git。完整步骤、备份及限制见 [本地使用说明](docs/LOCAL_DEVELOPMENT.md)。

全新检出后先安装依赖，再启动：

```sh
pnpm install
pnpm dev:local
pnpm check
pnpm test:e2e
pnpm test:local
```

首次 E2E 需要 `pnpm exec playwright install chromium`。`pnpm dev` 运行无持久保存的演示；`pnpm build` 默认构建公开演示，`pnpm preview` 预览构建结果。SQLite 服务不会被打进静态产物。

题库来源放在本地 `docs/400问.docx`，已提取 400 题且保留原编号正文。原文文件忽略；结构化题目在公开包内。重新提取 `pnpm questions:extract`，核验 `pnpm questions:check`；CI 未持有原件时核对来源内容校验和及完整生成结果。

## 文档

- [产品需求](docs/PRD.md)
- [架构及安全边界](docs/ARCHITECTURE.md)
- [阶段计划](docs/PLAN.md)
- [题库整理报告](docs/QUESTION_REVIEW.md)
- [大陆网络验收](docs/NETWORK_VALIDATION.md)
- [部署及账号配置](docs/DEPLOYMENT.md)
- [本地使用与备份](docs/LOCAL_DEVELOPMENT.md)
- [JSON 导出格式](docs/DATA_EXPORT.md)
- [整机备份与恢复副本](docs/LOCAL_BACKUP.md)

源码和题库可公开；私人答案、导出、密钥禁止进入 Git。不要将任何服务端密钥命名为 VITE\_\*。
