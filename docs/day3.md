# Day 3 交付说明

日期：2026-10-18
范围：验证记录与 AI 会话模型、完成门禁的真实数据来源、任务详情扩展、E2E 与 CI、种子数据与文档。

Day 2 已经让 `review → done` 会被验证门禁拦下，但底下没有 `Verification` / `AiSession` 模型，`passedVerifications` 恒为 0，完成门禁实际上无法达成。Day 3 把这两类记录做成真实数据，任务详情可以登记与删除，`review → done` 在条件满足时可以正常流转。

## 1. 交付清单

| 模块 | 内容 |
| --- | --- |
| 数据模型 | `Verification`（`verifications`）、`AiSession`（`ai_sessions`），`User` 增加反向关系；迁移 `20261018004419_verifications_ai_sessions` |
| 共享包 | `CompletionGateSummary`、`summarizeCompletionGate`；`evaluateVerificationGate` / `evaluateTraceabilityGate` 从同一份摘要派生 |
| API | 验证记录的增 / 查 / 删，AI 会话的增 / 查 / 删，共 6 个端点 |
| 任务详情 | `verifications`、`aiSessions` 数组；`gate` 扩展为规格、验收、通过验证、追溯四项 |
| 前端 | 任务详情新增「验证记录」「AI 会话」卡片；门禁面板四行；写入入口按 `task:write` 显隐 |
| 种子 | demo 项目 6 个任务，含 2 条验证记录与 2 条 AI 会话，可重复执行 |
| E2E | `apps/server/test/gates.e2e-spec.ts`，Node 内置 `fetch`，随机端口启动 |
| CI | 独立 e2e job：`mysql:8` service + `prisma migrate deploy` + seed + `test:e2e` |
| 文档 | `README.md`、本文件，`api-contract.md` 增加入口 |

## 2. 关键决策

1. **完成门禁只认真实记录，不再用占位数据。**
   `passedVerifications` 只统计 `result = 'passed'` 的验证；`aiSessionCount` 统计任务关联的会话数。Day 2 为了让错误码稳定而把两者固定为 0，Day 3 只替换输入来源，门禁规则本身没有改。未通过的验证会如实出现在列表里，但不会让完成门禁放行。

2. **门禁逻辑仍然只有一份。**
   `summarizeCompletionGate` 统一计算通过验证数、会话数、人工记录字数与两个 `ok` 标记；`evaluateVerificationGate`、`evaluateTraceabilityGate` 与详情接口的 `gate` 摘要都从它派生，不在 Nest 或前端另写计数口径。前端依旧只展示服务端返回的 `availableTransitions`，不自行判断按钮能否点击。

3. **记录随任务级联删除。**
   `Verification.taskId` 与 `AiSession.taskId` 都是 `onDelete: Cascade`，删除项目或任务时记录一起清掉，不会留下孤儿数据。记录人使用 `onDelete: SetNull`，删除用户不会连带删除历史记录。

4. **E2E 不引入新依赖。**
   用 Node 内置 `fetch` 发请求，通过 `NestFactory.create(AppModule, { logger: false })` 在随机端口启动真实应用，直接打 MySQL。这样 CI 不需要 supertest 等额外包，也覆盖了守卫、管道、Prisma 的完整链路。

5. **输入在 DTO 层规范化。**
   命令与标题去空白后校验长度，证据链接空串存 `null`，避免同一语义出现 `''` 与 `null` 两种存储；证据链接只接受 `http://` / `https://`，前端也只在协议合法时渲染 `<a>`，`javascript:` 之类不会被执行。错误文案使用中文，超长输入返回 400。

6. **状态流转在事务内做条件写。**
   门禁读取与状态更新放在同一事务，`updateMany({ where: { id, status: from } })` 没命中说明状态已被其他请求改掉，返回 409 而不是写出两条互相矛盾的历史。删除记录改用 `deleteMany` 并按 `count` 判断，并发删除不会把 Prisma 的 P2025 变成 500。

## 3. 状态与门禁

状态机与 Day 2 保持一致：

```
draft → ready → in_progress → review → done
          ↓         ↓             ↓
        draft     ready       in_progress
```

| 流转 | 检查 | 失败响应 |
| --- | --- | --- |
| `draft → ready`、`ready → in_progress` | 规格去空白后 ≥20 字，非空验收标准 ≥3 条 | 422 `SPEC_GATE` |
| `review → done` | 至少 1 条 `result='passed'` 的验证 | 409 `VERIFICATION_GATE` |
| `review → done` | 至少 1 条 AI 会话，或 `manualNote` 去空白后 ≥20 字 | 409 `TRACEABILITY_GATE` |
| 未列出的流转 | 状态机不允许 | 409 `INVALID_TRANSITION` |

验证与追溯同时缺失时，`reasons` 会列出两条原因，`code` 取第一条（`VERIFICATION_GATE`）。规格门禁仍只作用于两条前进边，回退不检查。

`TaskDetail.gate`：

```
{specLength, criteriaCount, specOk, criteriaOk,
 passedVerifications, verificationOk,
 aiSessionCount, manualNoteLength, traceabilityOk}
```

## 4. API

Base URL：`/api`。除登录与健康检查外都需要 Bearer JWT；括号内为接口要求的权限。

| 方法 | 路径 | 权限 | 说明 | 成功 | 失败 |
| --- | --- | --- | --- | --- | --- |
| POST | `/tasks/:id/verifications` | `task:write` | 新增验证记录 | 201 | 400 / 403 / 404 |
| GET | `/tasks/:id/verifications` | `task:read` | 验证记录列表，`createdAt desc, id desc` | 200 | 401 / 403 / 404 |
| DELETE | `/tasks/:id/verifications/:verificationId` | `task:write` | 删除验证记录 | 204 | 403 / 404 |
| POST | `/tasks/:id/ai-sessions` | `task:write` | 新增 AI 会话 | 201 | 400 / 403 / 404 |
| GET | `/tasks/:id/ai-sessions` | `task:read` | AI 会话列表，`createdAt desc, id desc` | 200 | 401 / 403 / 404 |
| DELETE | `/tasks/:id/ai-sessions/:sessionId` | `task:write` | 删除 AI 会话 | 204 | 403 / 404 |

请求体与响应：

```jsonc
// POST /tasks/:id/verifications
{ "command": "pnpm --filter @vibe/server test", "result": "passed",
  "evidenceUrl": "https://example.com/ci/123", "note": "17 个用例全部通过" }

// VerificationView
{ "id": "...", "taskId": "...", "command": "...", "result": "passed",
  "evidenceUrl": "...", "note": "...",
  "createdBy": { "id": "...", "name": "管理员" } | null,
  "createdAt": "2026-10-18T..." }

// POST /tasks/:id/ai-sessions
{ "title": "完成门禁联调", "tool": "Claude Code", "summary": "..." }

// AiSessionView
{ "id": "...", "taskId": "...", "title": "...", "tool": "...", "summary": "...",
  "createdBy": { "id": "...", "name": "管理员" } | null,
  "createdAt": "2026-10-18T..." }
```

校验规则：`command` 去空白后 1..500；`result` 必须是枚举值；`evidenceUrl` 去空白后最长 1000，空串存 `null`，且必须以 `http://` 或 `https://` 开头；`note` 最长 5000；`title` 去空白后 1..200；`tool` 最长 100；`summary` 最长 5000。

删除另一个任务的记录 id 返回 404，不泄露记录是否存在。响应里的 `createdBy` 只包含 `{id, name}`，不返回邮箱与 `passwordHash`。

## 5. 验证记录

### 实际结果

以下为本轮实际执行并观察到的结果。

| 验证项 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| 迁移已应用 | `SHOW TABLES`（容器 `vibe-console-mysql`，库 `vibe_console`） | 存在 `verifications`、`ai_sessions` 表 |
| 种子第一次 | `pnpm db:seed` | 1 个项目、6 个任务、2 条验证记录、2 条 AI 会话 |
| 种子第二次 | 再次 `pnpm db:seed` | 数量不变：1 个项目、6 个任务、2 条验证、2 条 AI 会话；验收标准 14 条、流转记录 9 条 |
| 种子场景 A（登录与 JWT） | 查库统计 | `review`；passed 0 条、failed 1 条、AI 会话 1 条；追溯满足但验证不通过 |
| 种子场景 B（完成门禁演示） | 查库统计 | `review`；passed 1 条、failed 0 条、AI 会话 1 条；规格 68 字、验收 3 条，历史 `draft → ready → in_progress → review` |
| 记录人 | 查库 | 2 条验证与 2 条会话的 `createdById` 均为 admin |
| 共享包构建 | `pnpm --filter @vibe/shared build` | 成功 |
| 服务端构建 | `pnpm --filter @vibe/server build` | 成功 |
| 服务端单元测试 | `pnpm --filter @vibe/server test` | 4 个套件、31 个用例全部通过（新增并发条件写未命中的 409 用例） |
| E2E | `pnpm --filter @vibe/server test:e2e` | 1 个套件、10 个用例全部通过：健康检查；无 token 401；viewer 写 403；短规格 422 `SPEC_GATE`；缺验证 409 且 reasons 两条；只有 failed 验证仍 409；补齐 passed 验证后 `review → done` 200 且写入流转记录；删除项目后任务、验证、会话均为 0 行 |
| E2E 数据清理 | 跑完后查库 | 临时项目 0 个；全库仍为 1 个项目、6 个任务、2 条验证、2 条会话 |
| 前端构建 | `pnpm --filter @vibe/web build` | 成功；入口 `index-BMYO2i1Y.js` 224.30 kB（gzip 85.98 kB） |
| 跨任务删除 | 在任务 A 建验证记录，经任务 B 的地址删除 | 404，不泄露记录归属 |
| 超长与非法输入 | 501 字 `command`；`evidenceUrl` 为 `javascript:alert(1)` | 均 400 |
| 并发删除 | 同一条验证记录并行 DELETE ×20 | 204 ×1、404 ×19、5xx ×0 |
| 并发流转 | `review → done` 与 `review → in_progress` 同时发起 | 一个 200、一个 409；最终历史中 `review` 只有一条出边，状态与出边一致 |
| 浏览器检查 | 390 / 760 / 1280px，仪表盘与任务详情 | 无横向滚动；viewer 无写入按钮；console error 与页面异常均为 0 |

### 待补

以下项目尚未执行，不能写成已完成：

- CI e2e job 实跑：本地 e2e 已通过，仓库尚未推送到 GitHub，CI 还没有触发过。

## 6. 明确没做的

- **Decision 模型仍未实现。** 「决策记录」目前只是任务标题，没有独立实体。
- **没有仪表盘。** 项目详情之外没有跨项目的统计视图。
- **没有更新接口。** 验证记录与 AI 会话只支持新增、列表与删除，不支持编辑。
- **没有分页与筛选。** 记录列表按任务全量返回；数据量大时需要补分页。
- **E2E 只覆盖 API。** 前端渲染与响应式宽度仍靠人工浏览器检查。
- **部署未更新。** 没有新增环境变量，Docker 镜像与 Compose 未改动。
- 没有 refresh token、审计日志导出、记录附件上传。

## 7. 下一步（Day 4 建议）

1. **决策记录**：建立 `Decision` 模型，记录背景、候选方案、最终选择与复核条件，并在任务详情展示。
2. **仪表盘**：跨项目汇总门禁通过率、待审查任务、验证失败数，给交付过程一个总览。
3. **部署**：把 Day 3 的新表与 CI e2e job 接到真实环境，确认 `prisma migrate deploy` 与种子开关在容器启动时的行为。
