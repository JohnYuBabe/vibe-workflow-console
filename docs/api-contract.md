# API contract

Base URL: `/api`

> 本文件记录 Day 1 的认证与权限契约。Day 2 新增的项目、任务、验收标准、状态流转接口，以及 `422` / `409` 的门禁错误体，见 [day2.md](day2.md)。Day 3 新增的验证记录与 AI 会话接口见 [day3.md](day3.md)。Day 4 新增的决策记录与仪表盘接口见 [day4.md](day4.md)。

All responses are JSON. Errors use NestJS default shape:

```json
{ "statusCode": 401, "message": "邮箱或密码错误", "error": "Unauthorized" }
```

例外：门禁失败（`422 SPEC_GATE`、`409 SPEC_GATE/VERIFICATION_GATE/TRACEABILITY_GATE/INVALID_TRANSITION`）的 body 是 `{message, code, reasons}`，没有 `statusCode` 与 `error` 字段。

## POST /api/auth/login

Request:

```json
{ "email": "admin@example.com", "password": "admin123" }
```

Success `200`:

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "clx...",
    "email": "admin@example.com",
    "name": "管理员",
    "roles": ["admin"],
    "permissions": ["project:read", "project:write", "task:read", "task:write", "decision:read", "decision:write", "user:manage"]
  }
}
```

Failure `401`: wrong email or password, same message for both (do not reveal which one).

## GET /api/auth/me

Header: `Authorization: Bearer <jwt>`

Success `200`: the same `user` object as above.

Failure `401`: missing/expired token.

## GET /api/health

Success `200`:

```json
{ "status": "ok", "db": "up" }
```

If the database is unreachable, return `503` with `{ "status": "error", "db": "down" }`.

## Seed accounts

| Role | Email | Password | Permissions |
| --- | --- | --- | --- |
| admin | admin@example.com | admin123 | all |
| editor | editor@example.com | editor123 | `project:read`, `project:write`, `task:read`, `task:write`, `decision:read`, `decision:write` |
| viewer | viewer@example.com | viewer123 | `project:read`, `task:read`, `decision:read` |

## Permission strings

- `project:read`
- `project:write`
- `task:read`
- `task:write`
- `decision:read`
- `decision:write`
- `user:manage`

Day 2 起由全局守卫强制：除 `@Public()` 标注的登录与健康检查外，所有接口都要求登录；`/projects`、`/tasks`、`/decisions` 的读写接口还要求对应权限，缺失返回 `403 { "message": "没有权限执行该操作" }`。Day 4 起 `decision:read` / `decision:write` 分别控制决策的读取与写入，`viewer` 只读。

## JWT payload

```json
{ "sub": "<userId>", "email": "admin@example.com" }
```

- Secret: `JWT_SECRET`
- Expiry: `JWT_EXPIRES_IN` (default `7d`)
- Day 1 deliberately has no refresh token. Add it only when a real need appears.
