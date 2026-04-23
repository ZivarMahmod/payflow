# Multi-stage Dockerfile for FlowPay API.
# Target image: ~150 MB (alpine + prod deps only).
#
# Build:  docker build -f apps/api/Dockerfile -t flowpay-api .
# Run:    docker run -p 3001:3001 --env-file apps/api/.env flowpay-api
#
# NOTE: build context is the monorepo root (so workspace resolution works).

# ─── Stage 1: install deps with full workspace context ───────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Enable corepack so pnpm is pinned to whatever root package.json says.
RUN corepack enable

# Copy just the files needed for a cacheable pnpm install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/pos-adapters/package.json packages/pos-adapters/
COPY packages/schemas/package.json packages/schemas/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile --filter @flowpay/api...

# ─── Stage 2: build the API ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/pos-adapters ./packages/pos-adapters
COPY packages/schemas ./packages/schemas

WORKDIR /app/apps/api
RUN pnpm build

# ─── Stage 3: runtime image ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN corepack enable

# Copy only what we need at runtime.
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/pos-adapters ./packages/pos-adapters
COPY --from=build /app/packages/schemas ./packages/schemas

# Fly.io and most orchestrators expect PORT from env; we default to 3001.
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

USER node
EXPOSE 3001

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
