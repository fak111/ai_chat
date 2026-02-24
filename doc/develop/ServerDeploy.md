---
版本: v3.0
创建时间: 2026-02-09
最后更新: 2026-02-09
作者: zfc & Claude
---

# A宝 后端服务器部署指南

> 实战验证的后端部署手册。踩过 Docker Hub 封锁、Supabase 连不上、域名未备案被拦截等坑，最终跑通。

## 目录

1. [部署架构](#1-部署架构)
2. [关键信息速查](#2-关键信息速查)
3. [首次部署](#3-首次部署)
4. [后续更新](#4-后续更新一键部署)
5. [运维速查](#5-运维速查)
6. [踩坑记录](#6-踩坑记录)（重点）
7. [安全提醒](#7-安全提醒)

---

## 1. 部署架构

```
手机 APP / 浏览器
        │
        │  HTTP (80) ← 用 IP 直连，不走域名！
        ▼
┌─────────────────────────────────────┐
│  火山引擎 118.196.78.215            │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Nginx :80 (default_server)  │  │
│  │  server_name _;              │  │
│  │  用 IP 访问，绕过 Suzaku 拦截  │  │
│  └──────────────┬────────────────┘  │
│                 │ proxy_pass        │
│  ┌──────────────▼────────────────┐  │
│  │  Spring Boot :8080            │  │
│  │  abao-server (Docker)         │  │
│  └──┬───────────────────┬────────┘  │
│     │                   │           │
│  ┌──▼────────┐  ┌───────▼──────┐   │
│  │ PostgreSQL │  │    Redis     │   │
│  │ :5432      │  │    :6379     │   │
│  │ (Docker)   │  │    (Docker)  │   │
│  └────────────┘  └──────────────┘   │
│                                     │
└─────────────────────────────────────┘
        │
        ▼  外部 API
   DeepSeek AI + Resend 邮箱
```

### 为什么不用域名 HTTPS？

**域名 `swjip.asia` 未完成 ICP 备案**。火山引擎的 Suzaku 安全系统会拦截所有通过未备案域名访问的外部请求：
- HTTP 请求被 302 重定向到 `https://webblock.volcengine.com`
- HTTPS 请求的 SSL 握手被直接截断（`SSL_ERROR_SYSCALL`）

**当前方案**：用 IP 直连 + Nginx 80 端口反代，完全绕过 Suzaku 的域名检测。

### 核心决策

| 决策 | 原因 |
|------|------|
| IP 直连，不用域名 | 域名未备案，被 Suzaku 拦截 |
| 本地 PG + Redis | 国内连 Supabase（AWS 新加坡）不稳定 |
| docker save/load 传镜像 | 国内服务器拉不动 Docker Hub |
| Nginx 80 端口反代 | 安全组只开了 22/80/443，8080 不通 |

---

## 2. 关键信息速查

| 项目 | 值 |
|------|-----|
| 服务器 IP | `118.196.78.215` |
| 云厂商 | 火山引擎（字节跳动） |
| SSH 命令 | `ssh -i /Users/zfc/Documents/test.pem root@118.196.78.215` |
| **APP baseUrl** | **`http://118.196.78.215`** |
| 域名 | `api.swjip.asia`（**未备案，外部不可用**，仅服务器内部可用） |
| 本地项目路径 | `/Users/zfc/code/ai_chat/` |
| 服务器部署路径 | `/opt/abao/` |
| 容器名 | `abao-server` / `abao-postgres` / `abao-redis` |
| 安全组开放端口 | 22 (SSH)、80 (HTTP)、443 (HTTPS) |

### 前置条件

| 项目 | 状态 |
|------|------|
| 服务器 Ubuntu 24.04 + Docker | 已有 |
| SSH 密钥 `/Users/zfc/Documents/test.pem` | 已有 |
| 安全组开放 22/80/443 | 已配 |
| Nginx 已安装 | 已配 |
| 本地 `.env` 含 DeepSeek/Resend/JWT 密钥 | 已有 |
| 本地 Docker Desktop（用于构建 amd64 镜像） | 已有 |

---

## 3. 首次部署

> 后续更新直接跳到 [第 4 节](#4-后续更新一键部署)。

### Step 1：本地准备 .env

编辑 `/Users/zfc/code/ai_chat/.env`：

```bash
APP_BASE_URL=http://118.196.78.215     # 用 IP，不用域名
MAIL_FROM=noreply@swjip.asia
DEEPSEEK_API_KEY=sk-xxx
RESEND_API_KEY=re_xxx
JWT_SECRET=xxx
```

### Step 2：本地构建 + 导出镜像

```bash
cd /Users/zfc/code/ai_chat

# 构建后端镜像（指定 linux/amd64，服务器是 x86）
docker build --platform linux/amd64 -t abao-server:latest ./server

# 拉取 PG + Redis（首次才需要）
docker pull --platform linux/amd64 postgres:15-alpine
docker pull --platform linux/amd64 redis:7-alpine

# 导出为 tar
docker save abao-server:latest -o /tmp/abao-server.tar
docker save postgres:15-alpine redis:7-alpine -o /tmp/pg-redis.tar
```

### Step 3：上传到服务器

```bash
# 上传镜像
scp -i /Users/zfc/Documents/test.pem \
  /tmp/abao-server.tar /tmp/pg-redis.tar \
  root@118.196.78.215:/opt/abao/

# 上传 compose + .env + server 源码
rsync -avz \
  --include='server/***' \
  --include='docker-compose.prod.yml' \
  --include='.env' \
  --exclude='*' \
  -e "ssh -i /Users/zfc/Documents/test.pem" \
  /Users/zfc/code/ai_chat/ root@118.196.78.215:/opt/abao/

rm /tmp/abao-server.tar /tmp/pg-redis.tar
```

### Step 4：服务器加载镜像并启动

```bash
ssh -i /Users/zfc/Documents/test.pem root@118.196.78.215
cd /opt/abao

# 加载镜像
docker load -i abao-server.tar
docker load -i pg-redis.tar
rm *.tar

# 启动
docker compose -f docker-compose.prod.yml up -d

# 验证
docker logs -f abao-server   # 等 "Started AbaoApplication"
curl http://localhost:8080/api/health
```

### Step 5：配置 Nginx（IP 直连方案）

```bash
# 安装
apt update && apt install -y nginx

# 创建 default server（用 IP 访问，绕过 Suzaku）
cat > /etc/nginx/sites-enabled/default << 'NGINX'
server {
    listen 80 default_server;
    server_name _;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

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

nginx -t && systemctl reload nginx
```

### Step 6：验证

```bash
# 服务器内部
curl http://localhost:8080/api/health
# ✅ {"status":"ok",...}

# 从本地/手机
curl http://118.196.78.215/api/health
# ✅ {"status":"ok",...}

# 注册测试
curl -X POST http://118.196.78.215/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Test123456","nickname":"Tester"}'
```

| 检查项 | 预期 |
|--------|------|
| `docker ps` | 3 容器 Up (healthy) |
| `curl http://localhost:8080/api/health` | `{"status":"ok"}` |
| 外部 `curl http://118.196.78.215/api/health` | `{"status":"ok"}` |

---

## 4. 后续更新（一键部署）

### 4.1 一键部署脚本

```bash
#!/bin/bash
set -e

SERVER="root@118.196.78.215"
KEY="/Users/zfc/Documents/test.pem"
SSH="ssh -i $KEY $SERVER"
SCP="scp -i $KEY"
PROJECT="/Users/zfc/code/ai_chat"

echo "===== [1/5] 本地构建镜像 ====="
docker build --platform linux/amd64 -t abao-server:latest $PROJECT/server

echo "===== [2/5] 导出镜像 ====="
docker save abao-server:latest -o /tmp/abao-server.tar

echo "===== [3/5] 上传到服务器 ====="
$SCP /tmp/abao-server.tar $SERVER:/opt/abao/
rsync -avz \
  --include='server/***' \
  --include='docker-compose.prod.yml' \
  --include='.env' \
  --exclude='*' \
  -e "ssh -i $KEY" \
  $PROJECT/ $SERVER:/opt/abao/
rm /tmp/abao-server.tar

echo "===== [4/5] 加载镜像并重启 ====="
$SSH "cd /opt/abao && docker load -i abao-server.tar && rm abao-server.tar && docker compose -f docker-compose.prod.yml up -d"

echo "===== [5/5] 验证 ====="
sleep 25
$SSH "curl -sf http://localhost:8080/api/health && echo ' ✅ OK' || echo ' ❌ FAIL'"
```

### 4.2 只更新配置

```bash
rsync -avz --include='docker-compose.prod.yml' --include='.env' --exclude='*' \
  -e "ssh -i /Users/zfc/Documents/test.pem" \
  /Users/zfc/code/ai_chat/ root@118.196.78.215:/opt/abao/

ssh -i /Users/zfc/Documents/test.pem root@118.196.78.215 \
  "cd /opt/abao && docker compose -f docker-compose.prod.yml up -d"
```

---

## 5. 运维速查

### 常用命令

```bash
# SSH
ssh -i /Users/zfc/Documents/test.pem root@118.196.78.215

# 容器状态
docker ps --format 'table {{.Names}}\t{{.Status}}'

# 日志
docker logs -f abao-server --tail 100

# 重启
cd /opt/abao && docker compose -f docker-compose.prod.yml restart

# 进数据库
docker exec -it abao-postgres psql -U postgres -d abao

# 手动验证邮箱
docker exec abao-postgres psql -U postgres -d abao \
  -c "UPDATE users SET email_verified = true WHERE email = 'xxx@example.com';"

# 创建测试账号（服务器内执行）
curl -s -X POST http://127.0.0.1:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@t.com","password":"Abc123456","nickname":"aaa"}'
docker exec abao-postgres psql -U postgres -d abao \
  -c "UPDATE users SET email_verified = true WHERE email = 'a@t.com';"

# 备份数据库
docker exec abao-postgres pg_dump -U postgres -d abao > /opt/abao/backup_$(date +%Y%m%d).sql
```

### 故障排查

| 现象 | 排查 |
|------|------|
| APP 连不上 | `curl http://118.196.78.215/api/health` 有响应→APP问题；无响应→服务器问题 |
| 502 Bad Gateway | `docker logs abao-server --tail 30` 看 Java 错误 |
| 容器没运行 | `docker ps -a`，`docker compose up -d` 重启 |
| 新端口不通 | 检查火山引擎安全组是否放行该端口 |
| 域名访问被拦截 | **正常现象**，域名未备案。只能用 IP 访问 |

---

## 6. 踩坑记录

### 6.1 域名未备案被 Suzaku 拦截（最大坑）

**现象**：手机 APP 注册报"请求失败"，浏览器访问 `https://api.swjip.asia` 显示 `ERR_EMPTY_RESPONSE`

**排查过程**：
1. 服务器内部 `curl http://127.0.0.1:8080/api/health` → 正常
2. 服务器内部 `curl https://api.swjip.asia/api/health` → 正常
3. 外部 `curl -H "Host: api.swjip.asia" http://118.196.78.215/api/health` → **302 到 `webblock.volcengine.com`**
4. 响应头 `Server: Suzaku` → 火山引擎 ICP 备案拦截系统

**根因**：中国大陆服务器的域名必须完成 ICP 备案。火山引擎在网络层部署了 Suzaku 系统，拦截所有通过未备案域名的请求。

**解决**：改用 IP 直连。Nginx `server_name _` 匹配所有 Host，外部用 `http://118.196.78.215` 访问，不触发 Suzaku 的域名检测。

**识别特征**：
- 服务器内部正常，外部不通
- HTTP 响应头含 `Server: Suzaku`
- 302 到 `https://webblock.volcengine.com`

### 6.2 Docker 端口只绑定 127.0.0.1

**现象**：改用 IP 直连 8080 端口后，手机仍报"连接超时"

**原因**：`docker-compose.prod.yml` 中 `ports: ["127.0.0.1:8080:8080"]` 只允许本机访问

**解决**：通过 Nginx 80 端口反代到 127.0.0.1:8080。不直接改成 `0.0.0.0:8080:8080`，保持后端只本机可达，由 Nginx 统一对外。

### 6.3 安全组未开放 443 端口

**现象**：外部 HTTPS SSL 握手失败 `SSL_ERROR_SYSCALL`

**原因**：火山引擎安全组只开放了 22 和 80，443 未开放

**解决**：在火山引擎控制台添加入站规则：TCP 443 0.0.0.0/0 允许。但由于域名未备案，开了 443 也被 Suzaku 拦截。

### 6.4 国内服务器无法拉取 Docker Hub 镜像

**现象**：`docker compose build` 报 `i/o timeout`

**解决**：本地 `docker build` + `docker save` 导出 tar + `scp` 传到服务器 + `docker load`

### 6.5 Supabase 连接失败

**现象**：`FATAL: Tenant or user not found`

**原因**：国内服务器连 Supabase（AWS 新加坡）认证失败

**解决**：放弃云数据库，改用本地 Docker 容器跑 PostgreSQL + Redis

### 6.6 YAML 数组格式错误

**现象**：`did not find expected ',' or ']'`

**原因**：healthcheck 数组末尾多了 `\]`

**教训**：复制 YAML 检查特殊字符

---

## 7. 安全提醒

- `.env` 含真实密钥：`chmod 600 /opt/abao/.env`
- SSH 密钥 `test.pem` 不要泄露
- Spring Boot 8080 只监听 127.0.0.1，不直接暴露
- PostgreSQL 不对外暴露端口
- Nginx CORS 当前 `*`，后续可收紧
- **HTTP 明文传输**：当前 IP 直连无 SSL，JWT Token 在网络上明文传输。备案后应切回 HTTPS

### 备案后迁移路径

完成 ICP 备案后：
1. Nginx 恢复域名 server_name + Certbot SSL
2. APP `baseUrl` 改回 `https://api.swjip.asia`
3. 重新打包 APK
