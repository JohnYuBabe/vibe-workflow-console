# Day 1 交付说明

日期：2026-10-17
范围：仓库骨架、登录、角色与权限、前后端连通、容器化脚手架。

这一天的目标不是做页面，而是把「身份 → 权限 → 数据」这条链路跑通，作为后面三条门禁的地基。

## 1. 交付清单

| 模块 | 内容 |
| --- | --- |
| 仓库 | pnpm workspace（`apps/*`、`packages/*`），单一 lockfile |
| 共享包 | `@vibe/shared`：权限字符串、角色预设、Demo 账号、API 类型 |
| 数据模型 | `User`、`Role`、`Permission`、`UserRole`、`RolePermission` |
| 认证 | `POST /api/auth/login`、`GET /api/auth/me`、JWT 守卫 |
| 前端 | 登录页、Token 持久化、路由守卫、控制台壳子、健康检查卡片 |
| 部署 | 两个 Dockerfile、容器内 Nginx、Compose、CI |
| 文档 | `README.md`、`docs/api-contract.md`、本文件 |

## 2. 关键决策

1. **NestJS 11 而不是 12。** 12 的包是 `"type": "module"`，纯 ESM，与 Nest 默认的 CommonJS 构建、装饰器元数据不兼容；Day 1 不为框架迁移买单。
2. **Prisma 6.19.3。** 避开 7/8 的 RC 阶段；迁移文件已入库，`migrate deploy` 可直接用于容器。
3. **`@vibe/shared` 编译成 CommonJS。** Vite 默认按 ESM 解析 workspace 包，需要在 `vite.config.ts` 里显式声明 `optimizeDeps.include` 与 `build.commonjsOptions.include`，否则 `DEMO_ACCOUNTS is not exported`。
4. **端口避让。** 本机 3000 被其他 node 进程占用、3307 被另一个 MySQL 占用，所以本地 API 用 3010、MySQL 用 3308；容器内仍是 3000/3306，由 Compose 映射。
5. **Token 存 localStorage。** key 固定为 `vibe_console_token`；Axios 响应拦截器遇到 401 清空 token 并回登录页，避免各处重复处理。
6. **构建阶段关闭 TypeScript 增量。** `nest build` 配置了 `deleteOutDir`，会先删 `dist`；若沿用 `incremental` 缓存，tsc 会认为产物没变而不再写文件，容器里就会缺 `dist`。`tsconfig.build.json` 里把 `incremental` 关掉，并在 `.dockerignore` 排除 `*.tsbuildinfo`。

## 3. 验证记录

以下均为本次实际执行结果，不是预期值。

| 验证项 | 命令 / 请求 | 结果 |
| --- | --- | --- |
| 迁移 | `pnpm db:migrate` | 生成并应用 `20261017140543_init` |
| 种子 | `pnpm db:seed` | 3 个 Demo 账号、5 条权限、3 个角色，可重复执行 |
| 服务端构建 | `pnpm --filter @vibe/server build` | 成功 |
| 单元测试 | `pnpm --filter @vibe/server test` | 5 passed |
| 前端类型检查 + 构建 | `pnpm --filter @vibe/web build` | 成功 |
| 全量构建 | `pnpm build` | shared → server → web 全部成功 |
| 全量测试 | `pnpm test` | server 5 passed，其余无测试 |
| 健康检查 | `GET /api/health` | `{"status":"ok","db":"up"}` |
| 登录 | `POST /api/auth/login`（admin@example.com） | 200，返回 token 与用户 |
| 当前用户 | `GET /api/auth/me`（Bearer） | 200，含 `admin` 角色与 5 条权限 |
| 错误密码 | `POST /api/auth/login` | 401 `邮箱或密码错误` |
| 前端代理 | `GET http://localhost:5173/api/health` | 200，Vite → 3010 转发正常 |
| 登录页渲染 | Chrome headless 截图 | 两栏布局、Demo 账号入口、表单均正常 |
| 登录全链路 | 无头浏览器填入 admin 账号登录 | 跳转控制台，身份卡显示角色与 5 条权限，健康卡「运行正常」 |
| 前端产物 | `pnpm --filter @vibe/web build` | 主包 162.90 kB（gzip 62.46 kB），无体积告警 |
| Compose 配置 | `docker compose config` | 通过 |
| 镜像构建 | `docker compose build server web` | server 812 MB、web 74 MB，均构建成功 |
| 容器全链路 | `docker compose up -d server web` | entrypoint 自动执行迁移与种子；8080 → Nginx → server → MySQL；`/api/health`、登录接口、`/login` 回退均 200 |

## 4. 明确没做的

不写进「已完成」，避免自我欺骗：

- **三条门禁**（规格、验证、追溯）尚无任何代码，控制台的检查清单里显示为「未实现」。
- `Project` / `Task` 实体不存在。
- 没有 refresh token、没有登录失败限流、没有权限守卫装饰器（`@RequirePermission`）。
- 移动端只做了基础响应式，没做完整适配。
- 没有 E2E 测试，登录链路是手工 + 脚本验证的。

Element Plus 已改成按需引入（`unplugin-vue-components` + `unplugin-auto-import`）。改动前主包 1.09 MB / gzip 360 KB，改动后 162.90 kB / gzip 62.46 kB。主题变量改挂在 `html:root` 上，保证晚到的组件样式不会盖掉主色。

## 5. 复现方式

```bash
cp .env.example .env
pnpm install
pnpm db:up          # MySQL 8，宿主机 3308
pnpm db:migrate
pnpm db:seed
pnpm dev            # web 5173 / api 3010
```

一键容器：

```bash
docker compose up --build
# web 8080 / api 3010
```

容器启动时 entrypoint 会执行 `prisma migrate deploy`；`SEED_ON_START=true`（Compose 默认）时写入 Demo 账号。

## 6. 下一步（Day 2）

1. `Project` / `Task` 实体与状态机：`draft → ready → in_progress → in_review → done`。
2. 规格门禁：没有 `spec` 和至少 3 条验收标准，任务不能从 `draft` 进入 `ready`。
3. 前端任务列表与详情页，先只做读和状态流转，不做实时协作。
4. 给状态流转补服务端单元测试，把「门禁不可绕过」写进测试用例。
