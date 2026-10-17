# Day 2 交付说明

日期：2026-10-17 ~ 2026-10-18
范围：全局权限守卫、Project/Task、规格门禁、种子数据与文档。

Day 1 把「身份 → 权限 → 数据」跑通；Day 2 把「任务状态不能随便改」变成服务端强制规则。规格门禁已经可用，完成门禁的规则已生效，但底层记录模型还没建。

## 1. 交付清单

| 模块 | 内容 |
| --- | --- |
| 数据模型 | `Project`、`Task`、`AcceptanceCriterion`、`TaskTransition`，迁移 `20261017145416_projects_tasks` |
| 共享包 | `@vibe/shared` 新增 `task-policy.ts`：状态常量与中文名、状态机、`evaluateTransition`、`availableTransitions` |
| 权限 | `@Public()`、`@RequirePermission()`、`PermissionsGuard`，通过 `APP_GUARD` 全局注册 |
| API | 项目 CRUD、任务 CRUD、验收标准重写、状态流转 |
| 种子 | demo 项目 `vibe-workflow-console` 与 5 个任务，含流转历史，可重复执行 |
| 前端 | 项目列表/详情、任务详情、门禁面板、按钮级权限 |
| 文档 | `README.md`、本文件 |

## 2. 关键决策

1. **门禁规则收敛到 `packages/shared` 的 `evaluateTransition`。**
   状态机、规格门禁、验证门禁、追溯门禁都写成不依赖 Nest / Prisma 的纯函数。后端用它决定 422 / 409，前端用 `availableTransitions` 决定按钮是否可用、展示哪些原因，页面不重新实现一遍判断。详情接口返回的 `gate` 摘要也来自同一模块的 `summarizeSpecGate`，避免「展示的字数」和「拦截的字数」各算一份。这样前后端口径不会漂移，规则也能直接做单元测试。

2. **`done` 在验证模型落地前必须被 409 拦下。**
   Day 2 没有 `Verification` 模型，`passedVerifications` 恒为 0。即使 `manualNote` 满足追溯要求，`review → done` 仍然要因为缺少通过的验证被拒绝。不拿人工记录或种子数据冒充验证结果；等模型落地后只替换输入来源，不改规则本身。

3. **权限改为全局守卫。**
   `JwtAuthGuard` 与 `PermissionsGuard` 用 `APP_GUARD` 注册。登录与健康检查通过 `@Public()` 放行，其余接口默认要求登录；写接口用 `@RequirePermission()` 声明所需权限，未声明权限的路由只校验登录。这样权限不再依赖各个控制器自己加守卫，`viewer` 的写操作会在服务端被 403 拦下，不依赖前端隐藏按钮。

4. **错误码按失败类型区分。**
   状态机不允许的流转、缺少验证、缺少追溯都返回 409，并带 `code` 与 `reasons`；规格不达标返回 422 `SPEC_GATE`。调用方可以据此区分「状态或记录不满足」与「输入不合格」。

5. **种子按名称删除再重建。**
   demo 项目名固定为 `vibe-workflow-console`。每次执行 seed 先 `deleteMany` 该项目，项目下的任务、验收标准、流转记录按外键级联删除，再整体重建，重复执行不会累积重复数据。

## 3. 状态与门禁

```
draft → ready → in_progress → review → done
          ↓         ↓             ↓
        draft     ready       in_progress
```

| 流转 | 检查 | 失败响应 |
| --- | --- | --- |
| `draft → ready`、`ready → in_progress` | 规格去空白后 ≥20 字，非空验收标准 ≥3 条 | 422 `SPEC_GATE` |
| `review → done` | 至少 1 条通过的验证 | 409 `VERIFICATION_GATE` |
| `review → done` | 至少 1 条 AI 会话，或 `manualNote` 去空白后 ≥20 字 | 409 `TRACEABILITY_GATE` |
| 未列出的流转 | 状态机不允许 | 409 `INVALID_TRANSITION` |

规格门禁失败时 `reasons` 会同时列出规格与验收标准的缺口，`code` 取第一条失败的门禁。错误文案使用状态中文名。

## 4. API

Base URL：`/api`。除登录与健康检查外都需要 Bearer JWT；括号内为接口要求的权限。

| 方法 | 路径 | 说明 | 失败响应 |
| --- | --- | --- | --- |
| POST | `/auth/login` | 登录，返回 token 与用户 | 401 |
| GET | `/auth/me` | 当前用户与权限 | 401 |
| GET | `/health` | 服务与数据库探活 | 503 |
| GET | `/projects`（`project:read`） | 项目列表，含 `taskCount` 与 `statusCounts` | 401 / 403 |
| POST | `/projects`（`project:write`） | 新建项目，owner 为当前用户 | 400 / 403 |
| GET | `/projects/:id`（`project:read`） | 项目详情与任务列表 | 404 |
| PATCH | `/projects/:id`（`project:write`） | 修改项目 | 400 / 404 |
| DELETE | `/projects/:id`（`project:write`） | 删除项目，任务级联删除 | 404 |
| POST | `/projects/:id/tasks`（`task:write`） | 新建任务，可同时写验收标准 | 400 / 404 |
| GET | `/tasks?projectId=&status=`（`task:read`） | 任务列表；`status` 非法返回 400 | 400 |
| GET | `/tasks/:id`（`task:read`） | 任务详情 | 404 |
| PATCH | `/tasks/:id`（`task:write`） | 修改标题、规格、人工记录 | 400 / 404 |
| PUT | `/tasks/:id/criteria`（`task:write`） | 过滤空串后按顺序重写验收标准 | 404 |
| POST | `/tasks/:id/transitions`（`task:write`） | 状态流转，成功写一条流转记录 | 409 / 422 |

`TaskDetail` 主要字段：

```
{id, project:{id,name}, title, spec, manualNote, status,
 criteria:[{id,content,position}],
 transitions:[{id,fromStatus,toStatus,actor:{id,name},note,createdAt}],
 availableTransitions:[{to,allowed,reasons}],
 gate:{specLength,criteriaCount,specOk,criteriaOk},
 createdAt, updatedAt}
```

规格门禁失败响应：

```json
{
  "message": "规格门禁未通过",
  "code": "SPEC_GATE",
  "reasons": ["规格至少 20 字，当前 8 字", "至少需要 3 条验收标准，当前 2 条"]
}
```

## 5. 验证记录

以下均为本次实际执行结果。

| 验证项 | 命令 / 请求 | 结果 |
| --- | --- | --- |
| 迁移 | `pnpm db:migrate` | 生成并应用 `20261017145416_projects_tasks` |
| 种子幂等 | `pnpm db:seed` 连续两次 | 两次都是 1 个项目、5 个任务；验收标准 3/3/2/0/3，流转记录 3/2/0/0/0 |
| 共享包构建 | `pnpm --filter @vibe/shared build` | 成功（CommonJS） |
| 服务端构建 | `pnpm --filter @vibe/server build` | 成功 |
| 服务端测试 | `pnpm --filter @vibe/server test` | 4 个套件、17 个用例全部通过 |
| 前端类型检查 + 构建 | `pnpm --filter @vibe/web build` | 成功；主包 224.36 kB（gzip 86.00 kB） |
| 未登录 | `GET /api/projects` 不带 token | 401 |
| 只读账号写 | viewer `POST /api/projects`、`PATCH /api/tasks/:id`、`POST /api/tasks/:id/transitions` | 403「没有权限执行该操作」 |
| 状态机 | `draft → ready → in_progress → review` | 均 200，并写入流转记录（actor 为当前用户） |
| 非法流转 | `ready → done` | 409 `INVALID_TRANSITION`「不允许从「待开发」直接流转到「已完成」」 |
| 规格门禁 | 空规格 + 0 条验收 `draft → ready` | 422 `SPEC_GATE`，`reasons` 同时列出规格与验收两条 |
| 规格门禁（部分修复） | 35 字规格 + 2 条验收 | 422，`reasons` 只剩验收一条 |
| 完成门禁 | `review → done`（无人工记录） | 409，同时报验证与追溯两条原因 |
| 追溯可满足 | 补 27 字 `manualNote` 后 `review → done` | 仍 409，`reasons` 只剩「没有通过的验证记录」 |
| 回退不被误拦 | `in_progress → ready`（规格被改短） | 200，回退不检查规格门禁 |
| 超长规格 | `PATCH /tasks/:id` 提交 70000 字符 | 400「任务规格最多 16000 字」（未加上限时是 500） |
| 删除级联 | `DELETE /api/projects/:id` | 204；随后查库，项目与任务均为 0 行 |
| 浏览器渲染 | 无头 Chrome 登录 admin / viewer | 项目与任务页面正常；viewer 看不到新建、删除、保存、流转按钮；390 / 760 / 1280px 无横向滚动；console 0 错误 |

## 6. 明确没做的

不写进「已完成」：

- **Verification / AiSession / Decision 模型不存在。** 验证门禁永远看到 0 条通过的验证；追溯只能用 `manualNote`，无法关联真实 AI 会话；「决策记录」目前只是一个任务标题，没有独立实体。
- **没有 E2E 测试。** 状态流转有服务端单元测试，但浏览器全链路没有纳入 CI。
- **没有更新部署。** Day 2 没有新增环境变量，Dockerfile / Compose 未改动；本日也没有重新构建和部署容器。
- 没有 refresh token、权限缓存、审计日志导出。
- 任务排序只有 `position` 字段和种子顺序，没有拖拽或排序接口。

## 7. 下一步（Day 3）

1. `Verification` 模型与记录接口，让 `review → done` 有真实数据可依。
2. `AiSession` 模型与任务关联，追溯门禁不再只依赖人工记录。
3. E2E 覆盖门禁正反例（规格 422、完成 409、权限 403）。
4. 更新 CI 与部署说明。
