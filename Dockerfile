# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci

# Copy source + build
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# OpenSSL required by Prisma schema engine (migrate deploy)
RUN apk add --no-cache openssl

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy built output + prisma client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Copy the prisma CLI from builder so we can run migrate deploy at startup
# prisma is a devDependency (omitted above) — we need the binary, not the module
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY prisma ./prisma
# Prisma v5: URL comes from DATABASE_URL env var via schema.prisma datasource

# Non-root user for security
RUN addgroup -S socialagent && adduser -S socialagent -G socialagent \
    && chown -R socialagent:socialagent /app
USER socialagent

EXPOSE 3000

# Run migrations then start (migrations are idempotent)
# Use local prisma binary (not npx) — reliable in air-gapped/offline prod envs
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/src/main"]
