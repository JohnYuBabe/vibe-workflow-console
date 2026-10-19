# 0008. E2E 用原生 fetch 打进程内真实应用

状态：已采纳
日期：2026-10-19

## 背景

门禁、权限、级联删除需要端到端验证。mock 掉 Prisma 会绕开真实的数据库行为：外键级联、条件写的 `count`、事务里的行锁都无法覆盖。引入 `supertest` 又会多一个依赖，并带来 `app.getHttpServer()` 的注入方式。

如果 E2E 只测 service，守卫顺序、DTO 校验、Prisma 外键行为都不会被执行；如果只测 controller，数据库约束仍然缺席。

## 决策

E2E 用真实应用和真实数据库：

- `NestFactory.create(AppModule, { logger: false })` 启动应用，`listen(0)` 让系统分配随机端口。
- 应用设置全局前缀 `/api`，测试请求统一走这个前缀。
- 用 Node 内置 `fetch` 走 HTTP，自己写 `call` 辅助函数处理 token、JSON 和响应状态。
- 连接真实 MySQL，登录 seed 出来的 `admin` / `viewer` 账号。
- 当前 18 个用例覆盖 401/403、规格 422、完成 409、决策摘要/详情、仪表盘与级联清理。
- `afterAll` 删除临时项目并关闭应用。
- CI 用 MySQL 8 service 提供数据库，测试内部不起容器。
- 测试文件是 `apps/server/test/gates.e2e-spec.ts`。

运行命令是 `pnpm --filter @vibe/server test:e2e`，配置在 `apps/server/jest-e2e.json`，串行执行（`--runInBand`）。

## 考虑过的替代方案

- `supertest` 加 `app.getHttpServer()`。Nest 社区常见做法，可以直接注入请求。没选：多一个依赖，而且它仍然要启动应用、连数据库；原生 `fetch` 已经能覆盖同样的 HTTP 链路，还少一层封装。
- 内存数据库。用 SQLite 或内存实现替代 MySQL。没选：项目依赖 MySQL 的 `SELECT ... FOR UPDATE`、外键级联和 Prisma 的行为，换数据库会测不到真实语义，甚至掩盖只在 MySQL 出现的问题。
- 纯 mock 的 E2E。mock service 或 repository，只验证 controller 分支。没选：mock 会绕开守卫、管道、Prisma 和数据库约束，无法证明「viewer 被 403」「删除项目后记录级联消失」这些端到端结论。

## 后果

收益：测试覆盖真实的守卫、管道、Prisma 与 MySQL 行为；不引入 `supertest` 等额外依赖；CI 里的 MySQL service 与本地 `.env` 使用同一套连接方式。

CI 在跑 E2E 前先执行 `prisma migrate deploy` 与 `tsx prisma/seed.ts`，数据库状态由流水线准备。

代价：跑 E2E 必须有可用的 MySQL 和 `DATABASE_URL`；用例串行执行，数量增长后总时长会线性上升；需要自己维护 `call` 辅助函数和环境变量加载；测试依赖 seed 账号，进程被强杀时 `afterAll` 不会执行，可能留下临时数据。

相关：[Day 3 交付说明](../day3.md)
