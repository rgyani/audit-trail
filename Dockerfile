# Stage 1: Build
FROM node:18-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:18-slim
WORKDIR /app
ENV NODE_ENV=production

# install curl for health checks
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Security: Run as non-root user
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]