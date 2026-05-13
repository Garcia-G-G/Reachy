# syntax=docker/dockerfile:1.7
# Reachy — unified web + worker image.
#
# One image serves both roles in Kamal:
#   • web    → `next start` (default CMD)
#   • worker → overridden cmd in config/deploy.yml runs tsx against
#              src/server/jobs/worker.ts
#
# We do NOT use Next's `output: 'standalone'` here. The standalone bundler
# tree-shakes everything tsx loads at runtime, breaking the worker. The
# tradeoff is image size (~700 MB vs ~180 MB) for runtime simplicity.

# === deps ============================================================
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# === builder =========================================================
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && pnpm build

# === runner ==========================================================
FROM node:22-alpine AS runner
# ffmpeg + fonts are required by the BullMQ worker (drawtext + compose).
# They add ~80 MB but keep the worker self-contained.
RUN apk add --no-cache libc6-compat ffmpeg fontconfig ttf-dejavu wget
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs reachy

# Full build artifacts + deps so BOTH roles can run from this image.
# `next start` reads .next/ + node_modules; the worker reads src/ + the
# same node_modules via tsx.
COPY --from=builder --chown=reachy:nodejs /app/.next ./.next
COPY --from=builder --chown=reachy:nodejs /app/public ./public
COPY --from=builder --chown=reachy:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=reachy:nodejs /app/package.json ./package.json
COPY --from=builder --chown=reachy:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=reachy:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=reachy:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=reachy:nodejs /app/src ./src
COPY --from=builder --chown=reachy:nodejs /app/messages ./messages

USER reachy
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# Default CMD is the web role. Kamal overrides this for the worker role
# in config/deploy.yml (`servers.worker.cmd`).
CMD ["node_modules/.bin/next", "start"]
