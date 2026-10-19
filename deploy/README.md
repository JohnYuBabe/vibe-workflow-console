# 部署手册（johnyu.wancafu.com/console/）

目标形态：

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| 前端静态文件 | 宿主机 `/var/www/console/` | 由宿主 nginx 直接托管，子路径 `/console/` |
| NestJS API | Docker `127.0.0.1:3010` | `docker compose` 只绑回环，不暴露公网 |
| MySQL 8 | Docker `127.0.0.1:3308` | 数据在 named volume `mysql-data` |
| TLS | 宝塔申请的 Let's Encrypt | 证书路径 `/www/server/panel/vhost/cert/johnyu.wancafu.com/` |

这样拆的原因是：前端只是一堆静态文件，没必要为它多一层容器和代理；
后端保持容器化，数据库和运行时一起受 compose 管理。

---

## 0. 前置条件（服务器）

- Ubuntu 22.04，已安装 Docker + Compose v2（`docker compose version`）
- nginx 由宝塔管理，站点 `johnyu.wancafu.com` 已有有效证书
- 80/443 对公网开放，3308/3010 **不要**在安全组放行

## 1. 首次部署

```bash
# 本地：同步代码（不含 node_modules / .git）
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude dist \
  ./ root@106.55.226.11:/opt/vibe-workflow-console/
```

```bash
# 服务器：生成 .env
cd /opt/vibe-workflow-console
cp .env.example .env
# 必改：MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / JWT_SECRET
#       ADMIN_PASSWORD / DEMO_PASSWORD
openssl rand -base64 32   # 每条口令单独生成
chmod 600 .env
```

```bash
# 服务器：构建并启动（首次会跑 prisma migrate deploy）
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3010/api/health
```

首次只启动空库。要写入演示数据，显式执行一次：

```bash
docker compose exec server ./node_modules/.bin/tsx prisma/seed.ts
```

生产 seed 的行为：

- 创建 `ADMIN_EMAIL` 管理员（密码不公开，至少 16 位）
- 创建 `DEMO_EMAIL` 演示账号（密码会显示在登录页，至少 12 位）
- 不会在日志里打印密码

## 2. 前端与 nginx

```bash
# 本地：按子路径构建（构建脚本会自检 base/api/口令泄漏）
VITE_BASE=/console/ \
VITE_API_BASE=/console/api \
VITE_DEMO_EMAIL=demo@vibe.local \
VITE_DEMO_PASSWORD='<与 .env 中 DEMO_PASSWORD 一致>' \
pnpm --filter @vibe/web build
```

```bash
# 本地：发布静态文件
rsync -az --delete apps/web/dist/ root@106.55.226.11:/var/www/console/
```

```bash
# 服务器：安装站点配置
cp /opt/vibe-workflow-console/deploy/nginx.conf \
   /www/server/panel/vhost/nginx/johnyu.wancafu.com.conf
nginx -t && nginx -s reload
```

宝塔面板里该站点的 SSL 保持开启，让自动续期继续工作（续期只更新证书文件，路径不变）。

## 3. 验收

```bash
curl -sI https://johnyu.wancafu.com/            # 302 → /console/
curl -sI https://johnyu.wancafu.com/console     # 301 → /console/
curl -s  https://johnyu.wancafu.com/console/healthz
curl -sI https://johnyu.wancafu.com/console/    # 200 + 安全响应头
curl -s  https://johnyu.wancafu.com/console/api/health
```

浏览器打开 `https://johnyu.wancafu.com/console/`，用登录页上的 demo 账号进入，
确认看板数字、任务流转与 GIF 一致。

## 4. 日常更新

```bash
# 服务器：拉新镜像（代码已通过 rsync 同步）
cd /opt/vibe-workflow-console
docker compose up -d --build server
docker compose logs --tail=100 server

# 本地：前端有改动时重新构建并 rsync dist
```

## 5. 回滚

- 镜像：`docker compose down && docker compose up -d` 前先保留上一份代码目录，
  或 `docker image ls` 找到旧镜像改 tag 重建。
- 前端：静态目录保留一份 `dist.prev/`，出问题直接换回并 reload nginx。
- 数据库：迁移只向前（`prisma migrate deploy`），回滚代码前先确认迁移是否兼容旧代码。

## 6. 演示数据重置（可选 cron）

演示账号允许写数据，建议每天凌晨重建一次：

```cron
17 4 * * * cd /opt/vibe-workflow-console && docker compose exec -T server ./node_modules/.bin/tsx prisma/seed.ts >> /var/log/vibe-seed.log 2>&1
```

## 7. 常见问题

| 现象 | 排查 |
| --- | --- |
| 502 | `docker compose ps` 是否 healthy；`curl 127.0.0.1:3010/api/health` |
| 页面 404 / 白屏 | `/var/www/console/index.html` 是否存在；日志里 `failed: Permission denied` 说明 nginx 用户读不到文件 |
| 静态资源 404 | 构建时 `VITE_BASE` 必须是 `/console/`，产物路径应与 nginx 的 `location /console/assets/` 对齐 |
| API 401 循环 | `JWT_SECRET` 改动过，旧 token 失效，重新登录即可 |
| 容器起不来 | `docker compose logs server`；生产缺 `JWT_SECRET` / `DATABASE_URL` 会直接退出 |
