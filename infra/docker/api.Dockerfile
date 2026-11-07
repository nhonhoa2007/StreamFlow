# Multi-stage production build for StreamFlow API

# Stage 1: Base image with pnpm
FROM node:22-alpine AS base
RUN apk add --no-cache ffmpeg && \
    corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app

# Stage 2: Compilation and build
FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY shared ./shared
COPY backend ./backend
COPY frontend ./frontend

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @streamflow/config build && \
    pnpm --filter @streamflow/contracts build && \
    pnpm --filter @streamflow/logger build && \
    pnpm --filter @streamflow/cache build && \
    pnpm --filter @streamflow/database build && \
    pnpm --filter @streamflow/api build && \
    pnpm --filter @streamflow/media-worker build && \
    pnpm --filter @streamflow/event-relay build && \
    pnpm --filter @streamflow/analytics-consumer build

# Stage 3: Minimal production runner
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --chown=nestjs:nodejs --from=builder /app ./

USER nestjs
EXPOSE 3000
CMD ["node", "backend/apps/api/dist/src/main.js"]
