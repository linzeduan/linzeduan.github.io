# 答案之间 Between Answers

我们各自回答人生，也在答案之间慢慢认识彼此。

两位朋友的私人问答 PWA。当前 0.1.0 是**演示和网络验证版本**：使用合成示例、会话内模拟，刷新不保留编辑；尚无生产登录或安全云同步，请勿输入真实私密内容。

## 本地运行

需要 Node >=22.12、pnpm 11.25.0。

```sh
pnpm install
pnpm dev
pnpm check
pnpm test:e2e
```

首次 E2E 需要 `pnpm exec playwright install chromium`。构建 `pnpm build`，预览 `pnpm preview`。

题库来源放在本地 `docs/400问.docx`，已提取 400 题且保留原编号正文。原文文件忽略；结构化题目在公开包内。重新提取 `pnpm questions:extract`，核验 `pnpm questions:check`；CI 未持有原件时核对来源内容校验和及完整生成结果。

## 文档

- [产品需求](docs/PRD.md)
- [架构及安全边界](docs/ARCHITECTURE.md)
- [阶段计划](docs/PLAN.md)
- [题库整理报告](docs/QUESTION_REVIEW.md)
- [大陆网络验收](docs/NETWORK_VALIDATION.md)
- [部署及账号配置](docs/DEPLOYMENT.md)

源码和题库可公开；私人答案、导出、密钥禁止进入 Git。不要将任何服务端密钥命名为 VITE\_\*。
