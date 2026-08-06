# Multi-stage Dockerfile for Dream Ludo (Root Repository Wrapper for GCP Cloud Build)

FROM node:20-alpine AS builder
WORKDIR /app/backend

# Copy backend package manifests
COPY backend/package*.json ./
RUN npm ci

# Copy tsconfig and source code
COPY backend/tsconfig.json ./
COPY backend/src ./src

# Build TypeScript code
RUN npm run build

# Production Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY backend/package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/backend/dist ./dist
COPY backend/public ./public

EXPOSE 8080

CMD ["node", "dist/server.js"]
