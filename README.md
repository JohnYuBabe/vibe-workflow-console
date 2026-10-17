# vibe-workflow-console

**AI 辅助交付的控制台。** 三条硬规则，防止「AI 写完就算完成」。

> 当前状态：Day 1 — 登录、角色/权限、服务端骨架、前端壳子已跑通。
> 三条门禁在后续里程碑实现，README 会在门禁可用后换上门禁 GIF。

## 三条规则

1. **没有规格和验收标准，任务不能进入开发。**
2. **没有通过的验证，任务不能标记完成。**
3. **每个完成项必须能追溯到 AI 会话或人工记录。**

这不是一个聊天客户端，也不是 Agent 运行器。它管的是交付过程：规格、AI 会话、验证、决策。

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

## 一键容器启动

```bash
cp .env.example .env
docker compose up --build
```

- Web：http://localhost:8080
- API：http://localhost:3010/api

容器启动时自动执行 `prisma migrate deploy`；`SEED_ON_START=true`（Compose 默认）时写入 Demo 账号。正式环境请把 `SEED_ON_START` 设为 `false`，并注入自己的 `JWT_SECRET`。

## 域名部署

[docs 里的 Nginx 模板](deploy/nginx.conf) 按 `https://johnyu.wancafu.com/console/` 子路径部署：构建时设置 `VITE_BASE=/console/`、`VITE_API_BASE=/console/api`，静态文件放到 `/var/www/console/`，API 反向代理到本机 3010。

## 目录

```
apps/
  server/        NestJS API
  web/           Vue 3 前端
packages/
  shared/        前后端共享类型
docs/
  api-contract.md
  day1.md
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

## License

MIT
