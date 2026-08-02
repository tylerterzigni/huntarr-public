FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
# npm install (not ci) — lockfile optional native deps differ between Windows dev and Linux Alpine
RUN npm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime image: app binaries + migrate/seed only. No .env, no host paths, no API keys.
# All secrets and integration URLs come from container environment / compose at runtime.
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# OCI identity is injected at build time (CI). Defaults stay generic so the
# Dockerfile itself never hardcodes a personal GitHub user or private LAN path.
ARG VERSION=0.1.0
ARG REVISION=unknown
ARG IMAGE_SOURCE=https://github.com/tylerterzigni/huntarr-public
ARG IMAGE_URL=https://github.com/tylerterzigni/huntarr-public
LABEL org.opencontainers.image.title="Huntarr" \
      org.opencontainers.image.description="Homelab media discovery for *arr stacks" \
      org.opencontainers.image.source="${IMAGE_SOURCE}" \
      org.opencontainers.image.url="${IMAGE_URL}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/src/lib/db ./src/lib/db
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Entrypoint: migrate → seed (idempotent; skips if users exist) → CMD
# Seed admin / DB / Auth / encryption keys: set via environment (see .env.example).
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
