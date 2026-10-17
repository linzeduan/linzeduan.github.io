# Work Buddy 交接入口

用户已明确：产品在这里设计与整理，后续由 Work Buddy 使用已有域名、云数据库接入并上传。不需要为本轮创建 Cloudflare/Firebase 账号，也不限定云供应商。

## 先看什么

1. [PRODUCT_DESIGN.md](PRODUCT_DESIGN.md)：页面、流转、全部关键状态、视觉与 19 张合成数据预览。
2. [API_CONTRACT.md](API_CONTRACT.md)：现有 HTTP 合约、身份与权限、原子操作。
3. [PRD.md](PRD.md)、[ARCHITECTURE.md](ARCHITECTURE.md)：产品边界和数据归属。
4. [V1_ACCEPTANCE.md](V1_ACCEPTANCE.md)：本轮证据与后续上线验收，不能用本地通过代替正式云验证。

## 版本与资源

仓库：`linzeduan/linzeduan.github.io`，开发分支 `feat/local-v1`，PR #3。设计交接标签 `v0.3.0-design`。旧站以 `archive/legacy-site-20261017` 保留，main 仍是先前的公开演示；交接阶段未触发新生产发布。

交接包由 `node scripts/package-handoff.mjs` 从干净的已提交版本生成，路径 `.local/handoff/`。包内：

- `source/`：源码、锁文件、题库、设计图和文档；不含 node_modules 或私人数据。
- `preview/`：强制演示模式构建的静态资源，可先上传查看设计；刷新还原合成内容。
- `BUILD.json`：版本、准确提交和构建模式；`HANDOFF.md` 为包内说明。

上传 preview 不等于私人应用已经上线。个人数据库、真实答案、JSON 导出、原始 DOCX 和凭证都不在交接包中。图片均来自隔离的合成数据环境。

## 先运行

Node.js 24、pnpm 11.25.0；执行 `pnpm install --frozen-lockfile`。

```sh
pnpm dev                  # 可交互的纯演示
pnpm dev:local            # 本机双账号 + SQLite 参考实现
pnpm check                # 题库、类型、单元/HTTP、构建
pnpm test:e2e             # 演示、PWA、网络探针回归
pnpm test:local           # 独立端口、临时库的真实双账号浏览器回归
```

当前 Windows 工作区没有全局 pnpm 时，可直接 `node scripts/local-dev.mjs`。本地业务参考与正式云接入分开，不读取或上传 `.local`。

## 接入已有域名与数据库

建议前端放在域名根路径，并把同域 `/api` 路由给云函数或后端。`localRequest` 当前只请求同域 `/api`，客户端不直接持有数据库服务密钥。平台映射集中在传输/数据访问层及服务端，不改写产品页面中的权限判断。

现有构建模式：未设置 `VITE_APP_MODE` 为演示；设置为 `local` 才装配真实 HTTP 原型，当前显示“本地”文案。这个名称不是生产环境配置，正式接入时需增加清晰的生产装配及保存位置文案。不存在已接通的 `VITE_API_BASE_URL` 开关；不能只填一个地址就声称云同步完成。

生产需要由资源持有人完成：

- 域名/HTTPS、前端静态托管、API 网关与私有数据库连接，服务凭证仅放服务端。
- 使用已有平台身份认证，或安全配置两个人的私有账号；关闭公开注册。参考 `/setup` 只适合本地初始化，不能原样暴露到公网。
- 会话 Cookie 加 Secure，并配置正式 Host/Origin；参考 `server/main.ts` 仅监听 loopback，其本地白名单不是公网配置。
- 按接口实现权限与事务；如果使用非关系库，也要保留等价原子约束。
- 对接平台的密码/身份恢复、配额和备份；本地 scrypt/SQLite 工具不等于所有云运行时都支持，不能直接上传网络探针作为产品后端。
- 根路径以外的部署要同步检查 Vite base、manifest 的 start_url/scope、图标路径与 service worker 注册路径；Hash 路由可继续保留。

## 正式私人使用前的检查

两个人在实际手机、Wi-Fi 和移动网络上，使用最终域名完成登录、保存、跨设备刷新、双向解锁、留言、导出、撤回、解散和恢复。直接调用云 API 确认：未双提交读不到对方、改不了对方记录、访问不了别的空间，注销与撤回不会因前端回滚或恢复旧备份重新开放。

确认旧 PWA 更新、资源路径、后台恢复和错误状态，记录备份恢复演练。通过前仅使用合成答案；不把截图尺寸模拟称为真机验收。V2/V3 保持后置，先让 V1 的私人记录与交流稳定。
