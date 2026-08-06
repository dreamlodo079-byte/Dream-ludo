# Multi-stage Dockerfile for Dream Ludo Backend & Web Landing Page

# 1. Build Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests & install all dependencies (including devDependencies for tsc)
COPY package*.json ./
RUN npm ci

# Copy tsconfig and source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to /app/dist
RUN npm run build

# 2. Production Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Copy static public assets (contains landing page index.html & APK download files)
COPY public ./public

EXPOSE 8080

CMD ["node", "dist/server.js"]
