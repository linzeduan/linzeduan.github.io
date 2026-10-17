# 云接入接口与业务约定

供 Work Buddy 对接已有云数据库。参考实现为 `server/http.ts`、`server/store.ts`；浏览器适配为 `src/data/http/connected-journal.ts`，DTO 见 `src/domain/types.ts`、`src/domain/local.ts`。供应商可换，以下隐私行为不能放宽。

## 传输与身份

当前真实客户端请求同域 `/api`，JSON 写请求，`credentials: same-origin`，10 秒超时，读写均不缓存。建议正式域名用 `/api` 网关承接，避免改动产品页面。错误统一 `{code,message}`；401 重新认证、403 未授权、404 不存在/非本人、409 版本或状态冲突。

身份来自服务端验证后的会话，不能取信请求中的 owner/profile 作为访问权。原型的 a/b 是两个人的稳定别名，可由云认证 UID 在适配层映射。云端使用 HTTPS、Secure/HttpOnly/SameSite Cookie，退出、改密和注销吊销会话。跨域接入必须明确调整凭据、CORS 和 Cookie 策略，不能只填一个地址。

## 路由

以下省略 `/api` 前缀，所有字段的类型/长度边界以参考实现及测试为准。

| 请求                           | 输入                                                                      | 输出 / 权限                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET /health                    | 无                                                                        | 健康标识，不读私人内容                                                                               |
| GET /session                   | Cookie                                                                    | initialized、可选 user                                                                               |
| POST /setup                    | a、b 各自 name/password                                                   | 仅本地首次初始化；公网必须改为管理员预置或平台私有邀请，不开放匿名占位                               |
| POST /login                    | profile、password                                                         | user，设置会话 Cookie；失败限速                                                                      |
| POST /logout                   | 当前会话                                                                  | 吊销会话，清 Cookie                                                                                  |
| GET /state                     | 当前会话                                                                  | 本人的 entries/notes、可访问轮次、共享状态、上海日期与今日题，不发送锁定的对方正文                   |
| POST /spaces                   | 空对象                                                                    | 新空间 id；每人至多一个活动空间                                                                      |
| POST /spaces/invite            | 空对象                                                                    | 随机 code、expiresAt；24 小时、单次，库中只存摘要                                                    |
| POST /spaces/join              | code                                                                      | 原子加入，最多两人，重复同一成功请求不再加人                                                         |
| POST /spaces/:id/dissolve      | confirmation: DISSOLVE_SPACE                                              | 关闭共享，保留双方个人记录                                                                           |
| POST /rounds/daily             | 可选 date                                                                 | 唯一 id，服务端上海自然日，限空间开始后至今天，可补答                                                |
| POST /rounds/free              | questionId、sensitiveConsent，可选 roundId/sourceEntryId/expectedRevision | id；客户端 roundId 为重试使用的 UUID，同一创建者/空间/题目只执行一次。复制来源须本人、同题、版本一致 |
| POST /rounds/:id/accept        | consent                                                                   | 自由题接收者接受；高敏感题须 true                                                                    |
| POST /rounds/:id/decline       | 空对象                                                                    | 未接受邀请可拒绝，关闭该轮                                                                           |
| POST /entries                  | id、questionId、text、note、expectedRevision，可选 roundId                | 本人 Entry；比较版本，保存并记录历史。新记录 expectedRevision=0                                      |
| GET /entries/:id               | 无                                                                        | 本人 Entry，含私密笔记                                                                               |
| DELETE /entries/:id            | 无                                                                        | 删除本人记录/版本并先关闭相关共享，不删除对方自己的记录                                              |
| GET /entries/:id/revisions     | 无                                                                        | 本人历史版本，含个人笔记与保存时间                                                                   |
| POST /entries/:id/reanswer     | 空对象                                                                    | 独立新 Entry，旧记录保留                                                                             |
| POST /rounds/:id/submit        | entryId、expectedRevision、operationId                                    | 冻结本人正文快照，不能共享 note；自由题须双方接受                                                    |
| GET /rounds/:id/answers/:owner | 无                                                                        | 本人快照，或双方仍正式共享时的对方正文                                                               |
| POST /rounds/:id/withdraw      | 空对象                                                                    | 撤回后关闭该轮，不允许原地恢复；重新共享另开轮次                                                     |
| POST /rounds/:id/comments      | text、operationId、可选 replyTo                                           | 仅保持解锁时可交流；重试不重复写入                                                                   |
| DELETE /comments/:id           | 无                                                                        | 仅作者可删除                                                                                         |
| POST /skips                    | questionId                                                                | 本人暂时跳过，不改变对方日程                                                                         |
| GET /export                    | 可选 includePartner=true                                                  | 默认本人 JSON；额外共享内容须仍有权限，详见 DATA_EXPORT.md                                           |
| POST /password                 | currentPassword、newPassword                                              | 修改本人密码，吊销全部旧会话                                                                         |
| DELETE /account                | password、confirmation: DELETE_MY_ACCOUNT                                 | 删除本人身份及数据，关闭共同空间，对方自己的数据保留                                                 |

## 数据与事务

参考表为 `server/schema.sql` 的版本 1。关系：spaces→members/rounds；rounds→submissions/comments；entries→entry_revisions。私密笔记在本人 entries.note，复制邀请时仍只写入本人新草稿；共享快照独立，不含笔记。

可用关系库或等价云模型，但邀请消费、人数上限、快照提交、草稿版本比较、复制邀请与删除/撤回必须原子执行。不要把本地 BEGIN IMMEDIATE 原样当成所有云平台的事务 API。固定推荐计划保存在 plans，既有空间不因更新前端重新排题。

读取对方答案必须同时满足：请求者为该轮成员、空间活动、该轮未关闭、双方已正式提交、未撤回、自由题已被双方接受。任何接口或导出都遵循相同判断。修改本人私人答案不改变已经共享的冻结版本。

命令响应丢失后可能重试。提交/留言复用 operationId，自由题复用客户端 roundId；不能因为界面隐藏而认为授权成立，也不能把私密内容先下发再靠前端遮挡。

## 云平台验收

沿用 `tests/unit/local-api.test.ts`、`tests/local/app.spec.ts` 的业务用例，在真正部署的云接口上复验。若直接使用 Firebase 客户端，则另写并用 Emulator 验证 Rules；若通过云函数/HTTP 网关，则检查服务端鉴权及数据库访问边界。`worker/` 只是旧网络探针，不能用作私人答案后端。
