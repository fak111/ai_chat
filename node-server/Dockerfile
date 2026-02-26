FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip curl git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/dist/ ./dist/
COPY storage/ ./storage/

# Create storage directories
RUN mkdir -p storage/memories storage/sessions

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
