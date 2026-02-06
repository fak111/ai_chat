# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

A宝 是一个 AI 群聊移动应用，让熟人网络可以在群聊中与 AI 互动。目前处于 MVP 设计阶段，尚无代码实现。





## 最重要的事情
1. **TDD 先行** - fix/feat 必须先写失败测试，再实现代码
2. **原子提交** - 每个 commit 只做一件事，可独立回滚
3. **文档驱动** - 所有feat改动关联 doc/下面的文档
4. **知识沉淀** - 任何有价值的对话迭代都要沉淀到 CLAUDE.md（比如我们成功解决了个问题，拿捏不准主动问我）
5. **任务彻底结束后，追加一句：**主人，用不用我沉淀 or git提交？**

## 技术栈

| 层级 | 技术 |
|------|------|
| 移动端 | Flutter 3.x |
| 后端 | Spring Boot 3.x + WebSocket |
| 数据库 | Supabase (PostgreSQL) |
| 缓存 | Caffeine (本地优先) + Upstash Redis |
| AI 服务 | DeepSeek API |
| 邮箱服务 | Resend |
| 对象存储 | Cloudflare R2 |
| 部署 | Docker + Railway |

## 核心功能

- **用户系统**: 邮箱注册/登录，JWT 认证，BCrypt 密码加密
- **群聊系统**: 创建/加入群聊（邀请码），WebSocket 实时消息
- **AI 系统**: @AI 触发回复，引用 AI 消息继续对话
- 详见 [doc/FeatureSummary.md](doc/FeatureSummary.md)

## 文档结构

| 文档 | 用途 |
|------|------|
| `doc/RequirementsDoc.md` | 原始需求 |
| `doc/PRD.md` | 产品需求文档 |
| `doc/FeatureSummary.md` | 功能摘要与契约 |
| `doc/DevelopmentPlan.md` | 技术方案与开发计划 |
| `doc/UIDesign.md` | UI 设计规范 |
| `doc/ServiceSetupGuide.md` | 第三方服务配置指南 |
| `.env.example` | 环境变量模板 |

## 开发阶段

当前: **Phase 0 - 设计阶段**

计划阶段:
- Phase 1 (MVP): 用户系统 + 群聊系统 + AI 交互
- Phase 2: 历史消息分页、邀请码分享优化
- Phase 3: iOS 版本、主题色、消息中心

## 架构要点

### 数据模型
```
users (用户) ──1:n──▶ group_members ◀──n:1── groups (群聊)
                                                │
                                                ▼ 1:n
                                            messages (消息)
```

### 缓存策略 (优化 Redis 调用)
- 在线状态: JVM 内存 ConcurrentHashMap
- 消息缓存: Caffeine 本地缓存优先，Redis 二级缓存
- AI 上下文: 直接查 PostgreSQL，不缓存
- 限流计数: Redis INCR (保留)

### 消息实时推送
- 协议: WebSocket + STOMP
- 延迟目标: < 1 秒
- AI 响应: < 5 秒

## 开发环境启动

### 1. 启动后端 + 数据库（Docker）

```bash
# 首次启动前，复制并配置环境变量
cp .env.example .env
# 编辑 .env，至少填入 DEEPSEEK_API_KEY

# 启动 PostgreSQL + Redis + Spring Boot 后端
docker-compose -f docker-compose.dev.yml up -d

# 查看后端日志
docker logs -f abao-server

# 停止服务
docker-compose -f docker-compose.dev.yml down
```

### 2. 启动前端（Flutter）

```bash
cd app

# 安装依赖
flutter pub get

# 运行 Web 版本（指定端口）
flutter run -d chrome --web-port=9191

# 或运行其他平台
flutter run -d macos
flutter run -d ios
flutter run -d android
```

### 3. 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Spring Boot 后端 | 8080 | API + WebSocket |
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存 |
| Flutter Web | 9191 | 前端（可自定义） |

### 4. 必需的环境变量（.env）

```bash
DEEPSEEK_API_KEY=sk-xxx    # AI 功能必需
RESEND_API_KEY=re_xxx      # 邮箱验证必需（或手动验证）
JWT_SECRET=xxx             # 有默认值，可选
```

### 5. 手动验证邮箱（跳过邮件服务）

```bash
docker exec abao-postgres psql -U postgres -d abao \
  -c "UPDATE users SET email_verified = true WHERE email = 'xxx@example.com';"
```

## 开发命令

```bash
# Flutter (移动端)
cd app
flutter pub get           # 安装依赖
flutter run               # 运行应用
flutter test              # 运行测试
flutter build apk         # 构建 Android APK

# Spring Boot (后端) - 直接运行（不用 Docker）
cd server
./gradlew bootRun         # 启动服务
./gradlew test            # 运行测试
./gradlew build           # 构建

# Docker 构建网络问题 (VPN/代理环境)
docker build --network=host -t <image-name> .   # 使用主机网络绕过隔离
```

## 踩坑记录

### Docker 构建时网络超时

**场景**: 开启 VPN/系统代理时，Docker 构建拉取依赖失败（Gradle/Maven/npm）

**原因**: Docker 默认使用桥接网络（bridge），与主机的 VPN/代理网络隔离

**解决方案**:

```bash
docker build --network=host -t <image-name> .
```

`--network=host` 让容器构建时直接使用主机网络栈，绕过网络隔离，从而正确使用主机的代理配置。

## 代码规范

### Spring Boot
- 分层架构: Controller → Service → Repository
- 使用 Spring Security + JWT 认证
- WebSocket 使用 STOMP 协议
- 所有 API 以 `/api/` 开头

### Flutter
- 状态管理: 待定 (推荐 Riverpod 或 Provider)
- 目录结构: 按功能模块划分

### 数据库
- 表名使用复数形式小写 (users, groups, messages)
- 外键命名: `{表名单数}_id`
- 必要字段: `id`, `created_at`, `updated_at`
