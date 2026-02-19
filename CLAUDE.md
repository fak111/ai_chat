# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

A宝 是一个 AI 群聊应用，让 AI 作为真正的群成员"住"在群里 — 有记忆、有态度、会接梗、会主动插话。

**核心差异化**：AI 不是被 @ 才说话的工具，是有性格的群友。

## 最重要的事情

1. **TDD 先行** - fix/feat 必须先写失败测试，红黄绿循环
2. **原子提交** - 每个 commit 只做一件事，可独立回滚
3. **文档驱动** - feat 改动关联 doc/ 下文档，多输出表格、流程图、ASCII 原型图
4. **知识沉淀** - 有价值的迭代沉淀到 CLAUDE.md（拿捏不准主动问我）
5. **利用现有工具** - 不重复造轮子，会开车 > 会修车
6. **任务结束后追加** - 主人，用不用我沉淀 or git 提交？

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 移动端 | Flutter 3.x | Web / Android / iOS / macOS |
| 后端 | Node.js + TypeScript + Express | Docker 容器化 |
| AI 框架 | Pi Agent Core (@mariozechner/pi-agent-core) | Agent 循环 + 工具系统 |
| 实时通信 | 原生 WebSocket (ws) | 非 STOMP，轻量直连 |
| 数据库 | PostgreSQL 15 (自建) | Docker 容器 |
| 缓存 | Redis 7 (自建) | Docker 容器 |
| AI 服务 | DeepSeek API (OpenAI 兼容) | 可切换其他 provider |
| 邮箱服务 | Resend | 可手动验证绕过 |
| 部署 | Docker + GitHub Actions + 自有服务器 | CI/CD 零传输策略 |

## AI 系统架构（核心）

```
用户消息
    │
    ├─ 含 @AI / 回复AI消息 ──→ 原有触发 ──→ Agent 处理
    │
    └─ 不含 @AI ──→ 三层漏斗主动插话机制
                     │
                     ├─ 层1: 本地规则预筛 (0成本)
                     │   疑问检测 / 求助检测 / 冷场救场 / 话题热度
                     │   短消息过滤 / 冷却期(5min or 8条)
                     │   ~90% 消息在此过滤
                     │
                     ├─ 层2: LLM 快速裁判 (~100 token)
                     │   DeepSeek 50 max_tokens, temp=0, 3秒超时
                     │   区分"真问题" vs "日常寒暄"
                     │   ~70% 在此过滤
                     │
                     └─ 层3: 完整 Agent 处理
                         注入主动插话语气提示
                         空回复 = AI 选择沉默（合法）
```

### AI 感知能力

| 能力 | 实现方式 | 文件 |
|------|---------|------|
| 群成员识别 | SQL 查 group_members，注入 system prompt | context-builder.ts |
| 时间感知 | 消息带相对时间戳（刚刚/3分钟前） | context-builder.ts |
| 用户画像 | 纯规则提取（技术栈/兴趣/职业），持久化到 profiles.json | user-profiler.ts |
| 活跃度统计 | 7天消息数聚合（活跃/偶尔/低频/潜水） | context-builder.ts |
| 群组记忆 | AI 用 remember 工具主动记录，持久化到 MEMORY.md | memory-manager.ts |
| 人设 | soul.md 定义（毒舌70%/温柔30%，可调） | soul.ts + doc/chat/pi/soul.md |
| 动态技能 | AI 运行时用 create_skill 自我扩展能力 | skill-loader.ts |

### AI 相关文件地图

```
node-server/src/agent/
├── ai-service.ts              # Agent 生命周期管理，per-group 实例
├── ai-processor.ts            # @AI 触发处理器
├── ai-proactive-processor.ts  # 主动插话处理器（串联三层漏斗）
├── ai-trigger.ts              # @AI / 回复AI 的触发检测
├── proactive-trigger.ts       # 层1: 本地规则引擎
├── proactive-evaluator.ts     # 层2: LLM 快速裁判
├── context-builder.ts         # 上下文窗口构建（30min/50条 + 群成员 + 活跃度）
├── soul.ts                    # System prompt 组装
├── user-profiler.ts           # 用户画像提取与持久化
├── memory/
│   └── memory-manager.ts      # 群组记忆 + session history
└── tools/
    ├── builtin/               # 内置工具（bash, db, search, remember, skill...）
    └── skill-loader.ts        # 动态技能热加载
```

## 核心功能

- **用户系统**: 邮箱注册/登录，JWT 认证，BCrypt 密码加密
- **群聊系统**: 创建/加入群聊（邀请码），WebSocket 实时消息
- **AI 系统**:
  - @AI 触发 + 回复 AI 消息继续对话
  - 三层漏斗主动插话（不用 @ 也会说话）
  - 群成员识别 + 用户画像 + 活跃度感知
  - 流式回复（打字机效果）
  - 动态技能系统（AI 运行时自我扩展）
  - 内置工具：bash、数据库查询、文件读写、网页搜索、记忆

## 数据模型

```
users (用户) ──1:n──▶ group_members ◀──n:1── groups (群聊)
                                                │
                                                ▼ 1:n
                                            messages (消息)

持久化存储（文件系统）:
storage/
├── memories/{groupId}/MEMORY.md     # 群组记忆（AI remember 工具写入）
├── profiles/{groupId}/profiles.json # 用户画像（自动提取）
├── sessions/{groupId}/history.jsonl # 会话历史
└── skills/{groupId}/               # 动态技能
```

## 开发阶段

当前: **Phase 1.5 — AI 能力增强**

已完成:
- Phase 0: 设计阶段
- Phase 1 (MVP): 用户系统 + 群聊系统 + AI @触发 + 部署上线
- Phase 1.5: Node.js 后端重写 + Pi Agent 框架 + 主动插话 + 用户感知

计划:
- Phase 2: 长期记忆摘要、消息引用链优化、离线推送
- Phase 3: iOS 版本、AI 人格自定义、多端同步

## 开发环境启动

### 1. 后端 + 数据库（Docker）

```bash
cp .env.example .env  # 首次，填入 DEEPSEEK_API_KEY

docker compose -f docker-compose.dev.yml up -d       # 启动
docker logs -f abao-server                            # 看日志
docker compose -f docker-compose.dev.yml down          # 停止
```

### 2. 前端（Flutter）

```bash
cd app && flutter pub get
flutter run -d chrome --web-port=9191    # Web
flutter run -d macos                      # macOS
```

**注意**: 系统代理会拦截 Flutter，用 `fweb` alias 启动（见 MEMORY.md #19）

### 3. 服务端口

| 服务 | 端口 |
|------|------|
| Node.js 后端 | 8080 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Flutter Web | 9191 |

### 4. 必需环境变量（.env）

```bash
DEEPSEEK_API_KEY=sk-xxx    # AI 功能必需
RESEND_API_KEY=re_xxx      # 邮箱验证（或手动验证绕过）
JWT_SECRET=xxx             # 有默认值，可选
```

### 5. 手动验证邮箱

```bash
docker exec abao-postgres psql -U postgres -d abao \
  -c "UPDATE users SET email_verified = true WHERE email = 'xxx@example.com';"
```

## 后端修改后必做流程

```bash
# 1. 构建验证
cd node-server && npm run build

# 2. 重建 & 重启
cd /Users/zfc/code/ai_chat
docker compose -f docker-compose.dev.yml up -d --build server
sleep 3 && docker logs abao-server 2>&1 | tail -5

# 3. Health Check
TOKEN=$(curl --noproxy localhost -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Test123456"}' | jq -r '.accessToken')
curl --noproxy localhost -s "http://localhost:8080/api/groups" -H "Authorization: Bearer $TOKEN" | jq '.[0].id'
```

## 生产部署

```
自有服务器 (118.196.78.215)
├── Docker: abao-server    (Node.js, 端口 8080)
├── Docker: abao-postgres  (PostgreSQL 15)
├── Docker: abao-redis     (Redis 7)
└── 外部依赖: DeepSeek API, Resend
```

CI/CD: GitHub Actions → SSH 到服务器 → `git clone --depth 1` + `docker build`（零传输策略）

## 代码规范

### Node.js 后端
- 分层: Routes → Services → DB (pg query)
- JWT 认证中间件
- WebSocket 原生 ws 库
- 所有 API 以 `/api/` 开头
- AI 相关代码集中在 `src/agent/`

### Flutter 前端
- 状态管理: Provider
- 目录结构: 按功能模块划分（screens/providers/services/models）

### 数据库
- 表名复数小写 (users, groups, messages)
- 外键: `{表名单数}_id`
- 必要字段: `id` (UUID), `created_at`, `updated_at`

## 产品定位参考

详见 `doc/chat/product/now.md`

> 体验抄 Telegram，交互抄 Discord，架构留 Matrix 口子，安全别学 Signal，平台化别学任何人。
> A宝的护城河在于"AI 作为群成员"这个全新品类。
