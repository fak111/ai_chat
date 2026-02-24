---
title: A宝 后端部署 + APK 分发方案
version: v1.1
created: 2026-02-09
updated: 2026-02-09
author: zfc
---

# A宝 后端部署 + APK 分发方案

## 1. 概述

将 A宝 后端 API 部署到自有服务器，打包 Android APK 分发给朋友安装。

**不涉及**：Flutter Web 部署、App Store 上架。

### 1.1 部署架构

```
朋友手机 (APK 安装)
        │
        │  HTTPS
        ▼
┌──────────────────────────┐
│  服务器 118.196.78.215   │
│                          │
│  ┌────────────────────┐  │
│  │  Nginx :443        │  │
│  │  api.swjip.asia    │  │
│  │  SSL 终端 + 反代    │  │
│  └─────────┬──────────┘  │
│            │              │
│  ┌─────────▼──────────┐  │
│  │  Spring Boot :8080 │  │
│  │  (Docker 容器)      │  │
│  └─────────┬──────────┘  │
│            │              │
└────────────┼──────────────┘
             │
    ┌────────┼──────────┐
    ▼        ▼          ▼
 Supabase  Upstash   DeepSeek
 PostgreSQL Redis     AI API
 (已有)    (已有)     (已有)
```

### 1.2 关键信息

| 项目 | 值 |
|------|-----|
| 服务器 IP | 118.196.78.215 |
| SSH 命令 | `ssh -i /Users/zfc/Documents/test.pem root@118.196.78.215` |
| API 域名 | api.swjip.asia |
| 后端端口 | 8080（Nginx 反代，不对外暴露） |
| 数据库 | Supabase 云（已有） |
| Redis | Upstash 云（已有） |

## 2. 部署步骤（后端）

### Step 1：DNS 配置（5 分钟）

在域名管理后台添加**子域名** A 记录：

| 记录类型 | 名称 | 值 | 代理 |
|----------|------|-----|------|
| A | api | 118.196.78.215 | DNS only（先关 Cloudflare 代理） |

> 主域名 `swjip.asia` 不受影响，继续指向原来的项目。

验证 DNS 生效：

```bash
ping api.swjip.asia
# 应该解析到 118.196.78.215
```

### Step 2：上传代码到服务器（5 分钟）

在**本地**执行：

```bash
# 只上传 server 目录 + compose + env 模板，不传 app 和 .env
rsync -avz \
  --include='server/***' \
  --include='docker-compose.yml' \
  --include='.env.example' \
  --exclude='*' \
  -e "ssh -i /Users/zfc/Documents/test.pem" \
  /Users/zfc/code/ai_chat/ root@118.196.78.215:/opt/abao/
```

### Step 3：配置生产环境变量（5 分钟）

SSH 到服务器：

```bash
ssh -i /Users/zfc/Documents/test.pem root@118.196.78.215

cd /opt/abao
cp .env.example .env
vi .env
```

填入以下内容（从本地 `.env` 复制对应值）：

```bash
# DeepSeek AI
DEEPSEEK_API_KEY=sk-你的密钥

# Resend 邮箱
RESEND_API_KEY=re_你的密钥
MAIL_FROM=noreply@swjip.asia

# Supabase 数据库
DATABASE_HOST=aws-0-ap-southeast-1.pooler.supabase.com
DATABASE_PORT=5432
DATABASE_NAME=postgres
DATABASE_USER=postgres.garxbqvpyphndtjlqvej
DATABASE_PASSWORD=你的密码

# Upstash Redis
REDIS_HOST=sought-poodle-47006.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=你的Redis密码

# 应用配置
APP_BASE_URL=https://api.swjip.asia
JWT_SECRET=你的JWT密钥
SERVER_PORT=8080
```

### Step 4：创建生产 Docker Compose（2 分钟）

在**服务器**上：

```bash
cat > /opt/abao/docker-compose.prod.yml << 'YAML'
version: '3.8'

services:
  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: abao-server
    restart: always
    ports:
      - "127.0.0.1:8080:8080"
    env_file:
      - .env
    environment:
      SPRING_PROFILES_ACTIVE: dev
      DATABASE_URL: jdbc:postgresql://${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}
      DATABASE_USERNAME: ${DATABASE_USER}
      DATABASE_PASSWORD: ${DATABASE_PASSWORD}
      REDIS_HOST: ${REDIS_HOST}
      REDIS_PORT: ${REDIS_PORT}
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      REDIS_SSL: "true"
      JWT_SECRET: ${JWT_SECRET}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      RESEND_API_KEY: ${RESEND_API_KEY}
      EMAIL_FROM: ${MAIL_FROM}
      APP_BASE_URL: ${APP_BASE_URL}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
YAML
```

> `127.0.0.1:8080:8080` 只监听本机回环，外部请求走 Nginx。

### Step 5：构建并启动后端（5-10 分钟）

```bash
cd /opt/abao

# 构建（首次较慢，Gradle 下载依赖）
docker compose -f docker-compose.prod.yml build

# 启动
docker compose -f docker-compose.prod.yml up -d

# 确认启动成功
docker logs -f abao-server
# 看到 "Started AbaoApplication in X seconds" 即成功

# 本地健康检查
curl http://localhost:8080/api/health
```

### Step 6：配置 Nginx + SSL（10 分钟）

```bash
# 安装 Nginx 和 Certbot
apt update && apt install -y nginx certbot python3-certbot-nginx

# 创建 Nginx 配置（纯 API 反代，不托管静态文件）
cat > /etc/nginx/sites-available/abao-api << 'NGINX'
server {
    listen 80;
    server_name api.swjip.asia;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS（允许 APK 跨域请求）
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
NGINX

# 启用站点（不要删 default，主域名可能还在用）
ln -sf /etc/nginx/sites-available/abao-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 申请 SSL 证书
certbot --nginx -d api.swjip.asia --non-interactive --agree-tos --email 你的邮箱
```

### Step 7：验证（2 分钟）

```bash
# 在服务器上
curl https://api.swjip.asia/api/health
# 应返回 {"status":"UP"} 或类似

# 在本地
curl https://api.swjip.asia/api/health
```

## 3. 打包 Android APK

### 3.1 修改 API 地址

```dart
// app/lib/services/api_service.dart 第 14 行
static const String baseUrl = 'https://api.swjip.asia';
```

### 3.2 生成签名密钥（仅首次）

```bash
keytool -genkey -v -keystore ~/abao-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias abao
# 按提示输入密码和信息

# 创建 key.properties（不要提交到 git！）
cat > /Users/zfc/code/ai_chat/app/android/key.properties << 'EOF'
storePassword=你设的密码
keyPassword=你设的密码
keyAlias=abao
storeFile=/Users/zfc/abao-release-key.jks
EOF
```

### 3.3 配置 build.gradle 签名

在 `app/android/app/build.gradle` 中：

```groovy
// android { 块之前添加
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    // ... 已有配置 ...

    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword']
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### 3.4 打包

```bash
cd /Users/zfc/code/ai_chat/app

flutter build apk --release

# 产物
ls -lh build/app/outputs/flutter-apk/app-release.apk
```

### 3.5 分发给朋友

```bash
# 方案 A：微信/QQ 直接发 APK 文件
# 产物路径: build/app/outputs/flutter-apk/app-release.apk

# 方案 B：上传到服务器生成下载链接
ssh -i /Users/zfc/Documents/test.pem root@118.196.78.215 "mkdir -p /var/www/download"
scp -i /Users/zfc/Documents/test.pem \
  build/app/outputs/flutter-apk/app-release.apk \
  root@118.196.78.215:/var/www/download/abao.apk
```

方案 B 需要在 Nginx 中加一段（可选）：

```nginx
# 追加到 /etc/nginx/sites-available/abao-api
server {
    listen 80;
    server_name api.swjip.asia;

    # APK 下载（加在最前面）
    location /download/ {
        alias /var/www/download/;
        autoindex off;
    }

    # ... 其余 API 配置不变 ...
}
```

下载链接：`https://api.swjip.asia/download/abao.apk`

## 4. 后续更新

### 4.1 一键部署脚本

在本地创建 `deploy.sh`：

```bash
#!/bin/bash
set -e

SERVER="root@118.196.78.215"
KEY="/Users/zfc/Documents/test.pem"
SSH="ssh -i $KEY $SERVER"

echo "===== 上传后端代码 ====="
rsync -avz \
  --include='server/***' \
  --include='docker-compose.prod.yml' \
  --exclude='*' \
  -e "ssh -i $KEY" \
  /Users/zfc/code/ai_chat/ $SERVER:/opt/abao/

echo "===== 重新构建并重启 ====="
$SSH "cd /opt/abao && docker compose -f docker-compose.prod.yml up -d --build"

echo "===== 等待启动... ====="
sleep 20
$SSH "curl -sf http://localhost:8080/api/health && echo ' ✅ 后端正常' || echo ' ❌ 启动失败'"
```

```bash
chmod +x deploy.sh
./deploy.sh
```

### 4.2 更新 APK

改了前端代码后：

```bash
cd /Users/zfc/code/ai_chat/app
flutter build apk --release
# 重新发给朋友安装
```

## 5. 运维

### 5.1 常用命令

```bash
# SSH 连接
ssh -i /Users/zfc/Documents/test.pem root@118.196.78.215

# 后端日志
docker logs -f abao-server --tail 100

# 重启
cd /opt/abao && docker compose -f docker-compose.prod.yml restart

# 资源监控
docker stats abao-server
free -h
df -h
```

### 5.2 故障排查

| 现象 | 排查 |
|------|------|
| APK 连不上后端 | 手机浏览器访问 `https://api.swjip.asia/api/health` |
| API 返回 502 | `docker logs abao-server` 看 Java 报错 |
| 容器没在跑 | `docker ps -a` 看状态，`docker compose up -d` 重启 |
| 数据库连不上 | 检查 Supabase 面板，连接数是否超限 |
| SSL 过期 | `certbot renew`（默认已有 cron 自动续期） |
| 服务器内存不足 | `free -h`，需要至少 1GB RAM |

## 6. 时间线

| 步骤 | 耗时 |
|------|------|
| DNS 配置 + 等生效 | 5 分钟 |
| 上传代码 + 配置 .env | 10 分钟 |
| Docker 构建后端 | 5-10 分钟 |
| Nginx + SSL | 10 分钟 |
| 验证 | 2 分钟 |
| **后端部署合计** | **~35 分钟** |
| | |
| 修改 API 地址 + 配签名 | 10 分钟 |
| 打包 APK | 5 分钟 |
| **APK 合计** | **~15 分钟** |
| | |
| **全部完成** | **~50 分钟** |
