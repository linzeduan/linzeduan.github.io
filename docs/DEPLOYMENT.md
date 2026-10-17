# 部署和外部配置

## 版本控制

目标仓库 https://github.com/linzeduan/linzeduan.github.io ，默认 main。旧站起点 1695756bcc6df930c43e6e466e316cd629d24e4b，已建立 archive/legacy-site-20261017 快照。开发使用 feat/between-answers，不 force-push，不清空 Git 历史。阶段提交先经过检查。

## GitHub Pages

在仓库 Settings → Pages → Build and deployment 选择 GitHub Actions。工作流 main 推送后检查并构建，部署 dist。用户站点 https://linzeduan.github.io/ 的资源根目录为 /；Hash 路由刷新仍进入根文件。

首次上线替换旧站，应验证同路径 /sw.js 完成接管并清理 zhongxiang-guide-\* 缓存；用曾访问过旧站的浏览器及已安装 PWA 测试。原站 localStorage/IndexedDB 不自动删除。当前阶段的安装元数据不代表离线私人数据存储。

## 本地验证探针

```sh
cp worker/.dev.vars.example worker/.dev.vars
pnpm worker:db:local
pnpm worker:dev
```

浏览器打开前端设置 → 网络检查，输入终端打印的本地服务根地址和示例中的 A 或 B token；地址仅支持本地 HTTP 或远程 HTTPS。示例 token 公开，只可本地使用。

## Cloudflare 免费验证

用户注册或登录 Cloudflare，Workers & Pages 保持 Free，不开 Workers Paid、R2、付费附加项。没有配置账号前，不能声称已部署或大陆直连可用。

当前 Windows 工作区已有依赖但 `pnpm` 不在全局 PATH。可以在项目根目录使用等价命令 `node node_modules/wrangler/bin/wrangler.js login` 完成登录；其余 Wrangler 命令也可用该前缀替代 `pnpm exec wrangler`。授权必须由用户本人在浏览器完成，账号密码和登录凭证不要发到聊天中。

1. 本机终端执行 `pnpm exec wrangler login`，由用户在浏览器授权，凭证不发聊天、不提交 Git。
2. 执行 `pnpm exec wrangler d1 create between-answers-probe`，将返回的 database_id 写入 worker/wrangler.jsonc，替换全零占位值。该 ID 是公开资源标识，非密钥。
3. 执行 `pnpm exec wrangler d1 migrations apply between-answers-probe --remote --config worker/wrangler.jsonc`。
4. 为 A、B 各生成一个不同的 32 字节随机 token，例如本地执行 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`。仅通过私下渠道交给对应测试者，不发在仓库或聊天。
5. 分别执行 `pnpm exec wrangler secret put PROBE_TOKEN_A --config worker/wrangler.jsonc` 和 B 对应命令，在交互输入中设置随机 token。
6. 执行 `pnpm worker:deploy`，记录真实 workers.dev URL。前端设置中输入该地址；不需要把探针密钥写进 .env。
7. 双方按 NETWORK_VALIDATION.md 使用普通 Wi-Fi 和移动网络做测试。默认域名失败则该候选尚未通过，不添加收费代理或购买域名绕过已确认约束。

只建一张测试表，每位用户一行固定标记；无匿名数据库写入、无真实用户认证、无私人答案。公共健康检查不访问数据库。允许的跨域站点精确列在 ALLOWED_ORIGINS，前端部署后无需额外域名。失败响应不暴露内部 SQL、秘密或正文。

## 后续生产接入

探针成功只是第一道门槛。正式认证、权限、恢复、备份、幂等及真实数据迁移必须独立设计与测试，不能复用探针 token 作为生产认证。若选 Firebase，必须部署经过 Emulator 验证的 Rules；若 D1，则以 Worker 权限和数据库事务为边界。

## 回滚

前端用新的回退提交恢复旧版本，不重写历史。演示阶段没有私人云数据。正式上线后数据库迁移与页面回滚分开，已撤回权限不能随页面回滚重新开放。
