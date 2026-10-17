FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.6.12 --activate
WORKDIR /app

# 只装 server + shared 需要的依赖，缓存层不随源码变化
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile --filter @vibe/server...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN pnpm --filter @vibe/shared build \
 && pnpm --filter @vibe/server exec prisma generate \
 && pnpm --filter @vibe/server build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl libc6-compat
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY apps/server/docker-entrypoint.sh ./apps/server/docker-entrypoint.sh
RUN chmod +x ./apps/server/docker-entrypoint.sh

WORKDIR /app/apps/server
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
