# vibe-workflow-console

**AI 辅助交付的控制台。** 三条硬规则，防止「AI 写完就算完成」。

> 当前状态：Day 2 — 全局权限守卫、Project/Task、规格门禁。
> 验证门禁与追溯门禁的规则和拦截已生效，但 Verification / AiSession 模型尚未实现，`review → done` 目前一定被拒绝。

## 三条规则

1. **没有规格和验收标准，任务不能进入开发。**
2. **没有通过的验证，任务不能标记完成。**
3. **每个完成项必须能追溯到 AI 会话或人工记录。**

这不是一个聊天客户端，也不是 Agent 运行器。它管的是交付过程：规格、AI 会话、验证、决策。

## 当前能力（Day 2）

- **项目与任务**：项目列表、项目详情、任务列表、任务详情；规格、验收标准、人工记录可编辑。
- **权限**：JWT 全局守卫 + `PermissionsGuard`；`@Public()` 放行登录与健康检查，其余接口默认要求登录。写接口用 `@RequirePermission` 声明权限，`viewer` 只读，`editor` / `admin` 可写。
- **规格门禁**：`draft → ready` 与 `ready → in_progress` 要求规格不少于 20 字、非空验收标准不少于 3 条，不满足返回 422。
- **完成门禁**：`review → done` 需要至少 1 条通过的验证。Day 2 没有验证记录模型，所以这条流转固定被 409 拦下；人工记录满 20 字只能满足追溯条件，绕不过验证门禁。
- **前端**：任务详情展示门禁面板（当前字数 / 条数）和流转时间线；流转按钮的可用状态直接来自服务端返回，页面不自己判断。

## 状态与门禁

```
draft → ready → in_progress → review → done
          ↓         ↓             ↓
        draft     ready       in_progress
```

向下箭头是允许的回退；`done` 没有出边。

| 流转 | 检查 | 失败响应 |
| --- | --- | --- |
| `draft → ready`、`ready → in_progress` | 规格去空白后 ≥20 字，非空验收标准 ≥3 条 | 422 `SPEC_GATE` |
| `review → done` | 至少 1 条通过的验证记录 | 409 `VERIFICATION_GATE` |
| `review → done` | 至少 1 条 AI 会话，或 `manualNote` 去空白后 ≥20 字 | 409 `TRACEABILITY_GATE` |
| 未列出的流转 | 状态机不允许 | 409 `INVALID_TRANSITION` |

错误文案使用状态中文名，例如「不允许从「草稿」直接流转到「已完成」」。

## 技术栈

- Web：Vue 3 + TypeScript + Vite + Element Plus + Pinia
- Server：NestJS + Prisma
- DB：MySQL 8
- Deploy：Docker Compose + Nginx

## 本地启动

前置：Node 20+、pnpm 8+、Docker。

```bash
cp .env.example .env

# 1. 起 MySQL（宿主机端口 3308，避免和本地 3306/3307 冲突）
pnpm db:up

# 2. 安装依赖
pnpm install

# 3. 建表 + 种子数据
pnpm db:migrate
pnpm db:seed

# 4. 起前后端
pnpm dev
```

- Web：http://localhost:5173
- API：http://localhost:3010/api
- 健康检查：http://localhost:3010/api/health

### Demo 账号

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| admin | admin@example.com | admin123 |
| editor | editor@example.com | editor123 |
| viewer | viewer@example.com | viewer123 |

### Demo 项目

`pnpm db:seed` 会按名称删除并重建项目 `vibe-workflow-console`，可重复执行。它包含 5 个任务：

- 「登录与 JWT」（待审查）与「规格门禁」（进行中）规格齐全，并带有流转历史；
- 「验证记录台账」只有 2 条验收标准，「AI 会话台账」规格为空，用来复现 422；
- 「决策记录」在待开发，规格与验收标准齐全。

## API

Base URL：`/api`。除登录与健康检查外都需要 `Authorization: Bearer <jwt>`；标注了权限的接口还要求对应权限，无权限返回 403。

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/auth/login` | 公开 | 登录，返回 JWT 与用户权限 |
| GET | `/auth/me` | 登录 | 当前用户与权限 |
| GET | `/health` | 公开 | 服务与数据库探活 |
| GET | `/projects` | `project:read` | 项目列表，含任务数与各状态计数 |
| POST | `/projects` | `project:write` | 新建项目，owner 为当前用户 |
| GET | `/projects/:id` | `project:read` | 项目详情与任务列表 |
| PATCH | `/projects/:id` | `project:write` | 修改项目 |
| DELETE | `/projects/:id` | `project:write` | 删除项目（级联任务） |
| POST | `/projects/:id/tasks` | `task:write` | 新建任务，可同时写验收标准 |
| GET | `/tasks?projectId=&status=` | `task:read` | 任务列表，可按项目与状态筛选 |
| GET | `/tasks/:id` | `task:read` | 任务详情，含门禁与可用流转 |
| PATCH | `/tasks/:id` | `task:write` | 修改标题、规格、人工记录 |
| PUT | `/tasks/:id/criteria` | `task:write` | 按顺序重写验收标准 |
| POST | `/tasks/:id/transitions` | `task:write` | 状态流转，门禁失败返回 422 / 409 |

任务详情的 `availableTransitions` 给出每个候选状态是否可用及原因，`gate` 给出规格字数与验收条数；字段明细与错误响应见 [docs/day2.md](docs/day2.md)。

## 一键容器启动

```bash
cp .env.example .env
docker compose up --build
```

- Web：http://localhost:8080
- API：http://localhost:3010/api

容器启动时自动执行 `prisma migrate deploy`；`SEED_ON_START=true`（Compose 默认）时写入 Demo 账号与 Demo 项目。正式环境请把 `SEED_ON_START` 设为 `false`，并注入自己的 `JWT_SECRET`。

## 域名部署

[docs 里的 Nginx 模板](deploy/nginx.conf) 按 `https://johnyu.wancafu.com/console/` 子路径部署：构建时设置 `VITE_BASE=/console/`、`VITE_API_BASE=/console/api`，静态文件放到 `/var/www/console/`，API 反向代理到本机 3010。

## 目录

```
apps/
  server/        NestJS API
  web/           Vue 3 前端
packages/
  shared/        前后端共享类型与门禁规则
docs/
  api-contract.md
  day1.md
  day2.md
deploy/
  nginx.conf     域名路径部署模板
```

## 测试

```bash
pnpm test
pnpm --filter @vibe/server test
pnpm --filter @vibe/web lint
```

## 文档

- [API 契约](docs/api-contract.md)
- [Day 1 交付说明](docs/day1.md)
- [Day 2 交付说明](docs/day2.md)

## License

MIT
