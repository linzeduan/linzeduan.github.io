# 答案之间 系统架构

## 技术决策

React、TypeScript strict、Vite、Tailwind，静态 PWA 托管于 linzeduan/linzeduan.github.io，根路径为 /，Hash 路由避免 Pages 深链接 404。所有外部资源打包。GitHub 中仅有代码、可公开题库和合成测试数据。

后端尚未定案。首个验证候选为 Cloudflare Workers Free + D1 Free；默认 API 域名必须在双方真实网络实测，不能把开发电脑代理下成功当成可达性证据。Firebase 仍为候选，Supabase/Appwrite 的人工恢复和 CloudBase 的活动续期不符合已确认偏好。

候选方案使用单个 Worker 作为认证、权限和业务边界，D1 不直接暴露前端。没有 Redis、队列、自建服务器或多服务。网络验证阶段只部署可删除的探针数据库，不接收真实答案。

## 模块与接口

app 负责路由、主题、依赖装配；features 放页面及交互；domain 放类型、日期和业务判断；data/ports 定义接口，data/mock 是明确标注的内存演示；真实 HTTP 实现与 Worker 接入后新增，不在组件中直接调用数据库。

AuthGateway 管会话；SpaceRepository 管绑定及成员；QuestionRepository 管版本题库；JournalRepository 管本人草稿、答案、笔记与版本；RoundRepository 管提交、撤回和获授权阅读；CommentRepository 管交流。无供应商类型穿透到页面。

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

撤回或解散后新读取立即拒绝；页面失焦、失联时隐藏对方内容，恢复先重新鉴权。已读内容或导出无法追回，管理端可读，不宣称端到端加密。

API 返回 Cache-Control: no-store，CORS 精确匹配前端 origin；CORS 不是鉴权。服务端凭证只放 Worker secrets。请求日志不记录正文、密码、邀请码和会话。

## 数据可靠性

服务端确认后显示同步成功。草稿节流保存并在切换页时保护未保存内容；离线只保留当前会话输入，不对对方答案持久缓存。版本号冲突返回 conflict，用户选择而非覆盖。提交有幂等 ID，超时先查结果。删除可重试，失败不显示成功。JSON 可迁移且带版本；重要操作确认。

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
