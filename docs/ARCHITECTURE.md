# 答案之间 系统架构

## 技术决策

最新分工：生产资源由 Work Buddy 提供和接入，本轮交付产品设计、HTTP 合约及本机参考实现。以下 Cloudflare/Firebase 是此前研究候选，不要求为了交接新增账号或锁定供应商；现有云资源按 API_CONTRACT.md 适配即可。

React、TypeScript strict、Vite、Tailwind，静态 PWA 托管于 linzeduan/linzeduan.github.io，根路径为 /，Hash 路由避免 Pages 深链接 404。所有外部资源打包。GitHub 中仅有代码、可公开题库和合成测试数据。

生产后端尚未定案。首个验证候选为 Cloudflare Workers Free + D1 Free；默认 API 域名必须在双方真实网络实测，不能把开发电脑代理下成功当成可达性证据。Firebase 仍为候选，Supabase/Appwrite 的人工恢复和 CloudBase 的活动续期不符合已确认偏好。

用户已选择先完成本地版本。0.2.0-local 使用 Node.js 24 自带 HTTP、crypto、SQLite，无额外服务器框架或数据库依赖，仅监听 loopback。真实 API 已实现权限与持久化；它是本地开发和业务验收适配，不代表云端已选定 Node 自建服务器。

候选方案使用单个 Worker 作为认证、权限和业务边界，D1 不直接暴露前端。没有 Redis、队列、自建服务器或多服务。网络验证阶段只部署可删除的探针数据库，不接收真实答案。

## 模块与接口

app 负责路由、主题、依赖装配；features 放页面及交互；domain 放类型、日期和业务判断；data/ports 定义接口，data/mock 是明确标注的内存演示；data/http/connected-journal.ts 是真实本地 HTTP 控制器，不在组件中直接调用数据库。

目前使用一个 JournalController/JournalRepository 与小型 localRequest 传输层，覆盖会话、绑定、题库和记录操作。认证页面、账号页使用该传输层；不为每张表增加空仓储。未来接口可按实际需要拆分，不让云供应商 SDK 类型穿透页面。

## 当前目录与调用

```text
src/
  app/                    路由、主题、依赖装配
  components/             通用组件、确认对话框
  content/                公开题库、冻结推荐计划
  domain/                 业务类型、日期、状态规则
  data/ports/             控制器、记录接口
  data/mock/              内存演示
  data/http/              本地 API 控制器、网络探针客户端
  features/
    daily/ journal/ shared/ archive/ settings/
    local/                账号入口、绑定、本人历史版本
  styles/
server/                   本地 HTTP、权限与事务、SQLite、scrypt
worker/                   独立的免费云网络探针
scripts/                  启动、校验、题库提取
tests/unit/               纯逻辑、控制器竞争条件、真实 HTTP 集成
tests/e2e/                公开演示、PWA、网络探针
tests/local/              双浏览器账号与磁盘持久化
docs/
.local/                   被 Git 忽略的本机数据库及开发产物
```

本地请求：React → ConnectedJournal → 同源 /api → Vite 反代 → loopback HTTP → Store → SQLite。数据库及密码材料不进入前端打包。公开 Pages 默认装配演示控制器，静态托管不会运行本地服务。

## 本地数据模型

以 `server/schema.sql` 为准：users、sessions、login_attempts、metadata、plans、spaces、members、invites、rounds、entries、entry_revisions、submissions、comments、skips。私人笔记是 entries.note 及本人历史版本字段，无单独 notes 表；共享快照只含答案正文。题库是原文校验过的静态只读数据；计划首次写入数据库并冻结，不随前端更新重排既有空间。

SQLite 开启外键、WAL 和 busy_timeout。邀请消费、提交、删除与解散用 BEGIN IMMEDIATE 事务，人数上限触发器及活动成员唯一索引兜底；草稿依 expectedRevision 比较，失败返回 409。提交和留言以 owner+operationId 唯一约束实现幂等。

两个账号只在首次初始化时创建，随后关闭注册；本地账号密码使用随机盐 scrypt（N=32768,r=8,p=1）。会话是 32 字节随机 token，数据库只存 SHA-256 哈希，有效期 7 天。Cookie 为 HttpOnly、SameSite=Strict，登录连续失败限制 15 分钟；改密码吊销全部旧会话。本地可信 Host/Origin 白名单和 JSON 写请求防止网页跨源操作，不能替代用户鉴权。

本地 HTTP Cookie 不设 Secure，原因是服务仅在 loopback HTTP 使用；不得照搬到互联网部署。云端 HTTPS、会话与恢复设计另行验收。

## 生产数据模型草案

关系表：users、sessions、spaces、members、invites、questions、plans、rounds、entries、entry_revisions、notes、submissions、comments。草稿、私人版本和共享快照必须分离。

- users 仅预置两人；开放注册关闭。认证方案在网络门槛通过后定稿，密码不得明文保存，认证不得只靠客户端状态。
- spaces status 为 waiting/active/dissolved；members 受唯一约束和服务端原子事务控制，两个成员固定。
- invites 使用至少 128 位随机值，数据库仅保存哈希，24 小时有效，单次消费；响应不暴露私密数据。
- rounds 关联冻结的计划版本、题目、日期、双方及来源。date 来自服务端上海日期；questionId 不能由客户端随意替换。
- entries、notes、entry_revisions 永远以当前会话 userId 过滤；服务端忽略客户端传来的所有者字段。
- submissions 是不可原地修改的快照，唯一键 roundId+userId；撤回是终态。重新分享新建轮次。
- comments 只在轮次保持解锁时给对方返回；作者仍能管理自己的记录。

## 核心安全约束

读取对方快照：访问者为该轮成员 AND 空间 active AND 双方快照有效已提交 AND 双方未撤回。SQL 查询及服务端响应层共同执行；不向浏览器发送锁定内容。本人始终可管理本人数据。

提交、消费邀请、人数限制等使用数据库原子操作。客户端不能设置 unlocked。对共享编辑返回拒绝；防止先读对方再悄悄改答案。所有输入校验类型、长度、字段、版本，使用绑定参数，不拼 SQL。

撤回或解散后新读取立即拒绝；页面进入后台、失联时隐藏对方内容，恢复先重新鉴权。已读内容或导出无法追回，管理端可读，不宣称端到端加密。

API 返回 Cache-Control: no-store。本地使用同源代理且不开放跨域读取，Origin/Host 限定本机；云探针 CORS 精确匹配前端 origin。CORS 不是鉴权。云端服务凭证只放 Worker secrets。请求日志不记录正文、密码、邀请码和会话。

## 数据可靠性

服务端确认后显示同步成功。草稿停顿 500ms 后串行保存，后续输入不被旧响应覆盖，旧轮询也不能覆盖已确认保存；切换应用页面保留输入，关闭浏览器前提示。未保存草稿不持久缓存，无法承诺系统崩溃后恢复。保存失败、重新鉴权及删除失败保留输入；冲突由用户选择下载副本或读取新版本。提交/留言超时重试复用幂等 ID，并由刷新读取最终状态。JSON 可迁移且带版本，尚无导入界面；重要操作确认。

导出默认为本人数据，历史版本含私人笔记；可明确选择仍获授权的共享内容。本地整机备份通过独立管理员 CLI 使用 SQLite 备份接口，捕获已提交 WAL 为独立文件并校验结构、完整性、外键和摘要。恢复只新建副本，关闭所有旧共享、清空会话及邀请码、交互重设密码，不覆盖原库；没有新增 HTTP 权限入口。删除是逻辑删除，不承诺擦除磁盘残留、已有导出及备份。本地管理员可读取双方库文件。详见 LOCAL_BACKUP.md。

## PWA 与旧站迁移

替换原 sw.js 的同一注册路径，删除仅以 zhongxiang-guide- 开头的旧 CacheStorage；不清除未知应用的 IndexedDB/localStorage。此阶段仅安装元数据，无离线能力声明；不缓存导航、私人答案或 API。更新后告知重载，不能丢失输入。

## 费用和外部依赖

保持免费计划，不绑计费或自动升级，不使用图片/语音和付费备份。免费政策、地区可达性及无 SLA 都是上线风险；年度复核，数据由用户定期导出。任何免费服务不能承诺永久不变。

官方依据（2026-10-17 核对）：

- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://supabase.com/pricing
- https://cloud.tencent.com/document/product/876/127357
