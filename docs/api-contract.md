# API contract — Day 1

Base URL: `/api`

All responses are JSON. Errors use NestJS default shape:

```json
{ "statusCode": 401, "message": "邮箱或密码错误", "error": "Unauthorized" }
```

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
    "permissions": ["project:read", "project:write", "task:read", "task:write", "user:manage"]
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
| editor | editor@example.com | editor123 | `project:read`, `project:write`, `task:read`, `task:write` |
| viewer | viewer@example.com | viewer123 | `project:read`, `task:read` |

## Permission strings

- `project:read`
- `project:write`
- `task:read`
- `task:write`
- `user:manage`

Day 1 only stores and returns them. The guard and UI enforcement arrive with the Project/Task work.

## JWT payload

```json
{ "sub": "<userId>", "email": "admin@example.com" }
```

- Secret: `JWT_SECRET`
- Expiry: `JWT_EXPIRES_IN` (default `7d`)
- Day 1 deliberately has no refresh token. Add it only when a real need appears.
