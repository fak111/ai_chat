---
title: A宝智能 AI 升级设计
version: v2.1
created: 2026-02-19
updated: 2026-02-19
author: fc zhang
---

# A宝智能 AI 升级设计

## 1. 背景与目标

### 1.1 现状

A宝后端是 Java Spring Boot，AI 层（`AIService.java`）是无状态的单次 DeepSeek API 调用。没有记忆、没有工具、没有推理循环。Java 层做的事情（CRUD + JWT 认证 + WebSocket）在 Node.js 生态都有成熟方案，不存在不可替代的技术优势。

### 1.2 目标

**完全重构后端为 Node.js + Pi Agent**，一步到位：

1. 用 Node.js/TypeScript 重写所有业务逻辑（认证、群聊、消息、WebSocket）
2. 原生集成 Pi Agent 框架，让 A宝具备记忆系统、工具调用、工具创造能力
3. 注入 soul.md 人格，让 AI 不只是答题机器

### 1.3 核心原则

- **用户数据零丢失**：PostgreSQL schema 不变，现有数据完整保留
- **API 契约兼容**：Flutter 前端最小改动
- **TDD 先行**：每个模块先写测试，后实现
- **原子迁移**：停 Java → 启 Node.js，切换窗口 < 5 分钟

## 2. 架构

```
┌─────────────────────────────────────────────────┐
│              Docker Compose                      │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │          abao-server (Node.js 8080)       │  │
│  │                                           │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────┐  │  │
│  │  │ Express │  │WebSocket │  │Pi Agent  │  │  │
│  │  │ REST API│  │ ws 库    │  │状态机     │  │  │
│  │  │         │  │          │  │          │  │  │
│  │  │ Auth    │  │ 实时消息  │  │ 记忆系统 │  │  │
│  │  │ Groups  │  │ 在线状态  │  │ 工具系统 │  │  │
│  │  │ Messages│  │          │  │ 人格注入 │  │  │
│  │  └────┬────┘  └────┬─────┘  └────┬─────┘  │  │
│  │       └────────────┼─────────────┘        │  │
│  │                    │                      │  │
│  └────────────────────┼──────────────────────┘  │
│                       │                         │
│  ┌────────┐    ┌──────┴──────┐    ┌──────────┐  │
│  │Postgres│    │   storage/  │    │  nsjail   │  │
│  │ 15     │    │ memories/   │    │  沙盒     │  │
│  │        │    │ sessions/   │    │          │  │
│  └────────┘    └─────────────┘    └──────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

**一个服务，一种语言，一套部署。**

## 3. 技术选型

| 层 | 选择 | 理由 |
|----|------|------|
| 运行时 | Node.js 20+ | Pi Agent 要求，LTS |
| 语言 | TypeScript 5.x | 与 Pi Agent 统一 |
| HTTP | Express 4.x | 成熟，中间件丰富 |
| WebSocket | ws 8.x | 原生性能，协议灵活 |
| 数据库 | pg (node-postgres) | 直接 SQL，零 ORM 开销，复用现有 schema |
| Agent | @mariozechner/pi-agent-core + pi-ai ^0.52.9 | 状态机 + 多模型切换 |
| 会话管理 | @mariozechner/pi-coding-agent ^0.52.9 | 上下文压缩、文件持久化（可选） |
| 密码 | bcrypt 5.x | 与 Java BCrypt hash 兼容 |
| JWT | jsonwebtoken 9.x | 业界标准 |
| 校验 | zod 3.x | TypeScript-first |
| 日志 | pino 8.x | 高性能结构化 |
| 测试 | vitest 1.x | 快速，TS 原生 |
| 沙盒 | nsjail | Google 出品，Apache-2.0，淘汰 E2B/Firecracker/gVisor/bubblewrap |
| AI 模型 | 环境变量可配置（AI_PROVIDER / AI_MODEL） | 默认 DeepSeek，支持 Kimi/Claude/GPT 等 |

## 4. 三大新能力

### 4.1 记忆系统（三层架构）

| 层级 | 触发条件 | 存储 | 验收标准 |
|------|---------|------|---------|
| 永久记忆 | 用户显式指令"记住这件事" | `storage/memories/{groupId}/MEMORY.md` | 跨会话保留，@AI 时自动携带 |
| 会话持久化 | 每群自动维护 | `storage/sessions/{groupId}/history.jsonl` | 服务重启后历史可恢复 |
| 上下文窗口 | 每次 @AI 触发时组装 | Agent 内存 | 最近 50 条 + replyTo 补偿 |

**待明确：**
- 永久记忆检索策略：关键词匹配 vs 语义搜索（需向量数据库）
- 与现有 `contextWindowMinutes=30` / `contextMaxMessages=50` 的关系（替代 or 共存）
- 会话历史 compaction 阈值（文件 > 50MB 或消息 > 10,000 时触发 LLM 摘要）

### 4.2 工具调用

Agent 自主决定何时使用工具，内置 MVP 工具集：

| 工具 | 功能 | 执行环境 |
|------|------|---------|
| bash | 执行 shell 命令 | nsjail 沙盒 |
| query_db | 只读 SQL 查询 | PostgreSQL |
| remember | 保存永久记忆 | 文件系统 |

### 4.3 工具创造

Agent 能写代码生成新工具：
1. 用户："创建一个查天气的工具"
2. Agent 生成工具代码 → 沙盒中验证
3. 持久化到 `tools/dynamic/{groupId}/`
4. 热加载（`import()`），立即可用

**沙盒配置（nsjail）：**

| 限制项 | 配置 |
|--------|------|
| 执行时间 | 30 秒 |
| 内存 | 256MB |
| 文件写入 | 10MB |
| 网络 | 禁止 |
| 文件系统 | 根目录只读，仅 `/tmp/sandbox-xxx` 可写 |

Node.js 集成：封装为 `runInSandbox(code, timeout)`，临时目录隔离 + 执行后清理。

**待明确：** 工具审核机制（AI 造的工具谁审批？自动 or 人工？）

### 4.4 人格系统

基于 `soul.md` 注入 Agent 人格：
- 核心信条、语气风格、红线规则
- 群聊 vs 私聊自动切换模式
- 毒舌/温柔 slider 可调节

**注入策略（待定）：**
- soul.md 全文 ~1500 tokens，作为 system prompt 注入可行但偏大
- 可选方案：按场景动态裁剪（群聊模式只注入"群聊适配"部分）
- token 预算需评估：system prompt (soul + 永久记忆 + 群成员) 控制在 3000 tokens 以内

## 5. 重构计划

### 阶段依赖关系

```
Phase 1 (认证) ──► Phase 2 (群聊+WebSocket) ──► Phase 3 (Agent)
                                                     │
                                                     ▼
                                               Phase 4 (工具+沙盒)
                                                     │
                                                     ▼
                                               Phase 5 (测试+部署)
```

### Phase 1: 基础设施 + 认证（第 1 周）

**目标：** Express + PostgreSQL + JWT 认证链路跑通

| 任务 | 关键文件 | TDD 验证 |
|------|---------|---------|
| 项目初始化 | package.json, tsconfig.json | `npm run build` 通过 |
| PostgreSQL 连接池 | src/db/client.ts | 连接测试通过 |
| Auth Service + Routes | src/services/auth.service.ts, src/api/routes/auth.routes.ts | 注册/登录/JWT 7 个端点 |
| JWT 中间件 | src/api/middleware/auth.middleware.ts | 保护端点返回 401 |
| Email Service | src/services/email.service.ts | Resend 发送验证邮件 |

**回归测试：** 复用 `server/scripts/api_test.sh` 中 Auth 部分用例。

### Phase 2: 群聊 + 消息 + WebSocket（第 2 周）

**目标：** 基础群聊功能工作（无 AI），Flutter 前端连接正常

| 任务 | 关键文件 | TDD 验证 |
|------|---------|---------|
| Group Service + Routes | src/services/group.service.ts | 创建/加入/列表/退出 6 个端点 |
| Message Service + Routes | src/services/message.service.ts | 发送/查询 4 个端点 |
| WebSocket Server | src/websocket/ws-server.ts | JWT 握手认证 |
| WebSocket Handler | src/websocket/ws-handler.ts | SEND_MESSAGE 广播 |
| Session Manager | src/websocket/ws-session-manager.ts | 在线状态追踪 |

**回归测试：** `api_test.sh` 全部 31 个用例通过 + Flutter 客户端手动验证。

### Phase 3: Pi Agent 集成（第 3-4 周）

**目标：** @AI 触发 Agent 回复，记忆系统工作

| 任务 | 关键文件 | TDD 验证 |
|------|---------|---------|
| Agent Factory + Orchestrator | src/agent/ | 每群创建 Agent 实例 |
| 三层记忆系统 | src/agent/memory/ | 记忆写入/读取/跨会话恢复 |
| @AI 触发 + 引用回复 | ws-handler.ts | 用户 @AI → Agent 回复 |
| 人格注入 | src/agent/soul.ts | soul.md → system prompt |

### Phase 4: 工具系统 + 沙盒（第 5 周）

| 任务 | 关键文件 | TDD 验证 |
|------|---------|---------|
| nsjail 集成 | src/agent/sandbox/nsjail-executor.ts | 沙盒执行并返回结果 |
| 内置工具（bash, query_db, remember） | src/agent/tools/builtin/ | Agent 选择并执行工具 |
| 动态工具创建 + 热加载 | src/agent/tools/dynamic/ | AI 造工具 → 持久化 → 可用 |

### Phase 5: 测试 + 部署（第 6 周）

| 任务 | 验证 |
|------|------|
| 集成测试 | 全链路：注册 → 创建群 → 聊天 → @AI → 工具调用 |
| API 兼容性回归 | `api_test.sh` 31 个用例全绿 |
| Docker 构建 | Dockerfile（含 nsjail）+ docker-compose 更新 |
| 生产部署 | 停 Java → 启 Node.js → 冒烟测试 |

## 6. 风险管理

| 风险 | 缓解策略 |
|------|---------|
| 用户密码 hash 不兼容 | Node.js bcrypt 与 Java BCrypt 标准兼容，部署前用现有账号测试登录 |
| WebSocket 协议偏差 | 对照 Java `WebSocketHandler` 逐消息类型测试，Flutter 端验证 |
| nsjail 服务器不可用 | 先在生产 OS 测试；备选：Docker-in-Docker |
| Agent 内存泄漏 | 30 分钟不活跃自动清理 Agent 实例；监控 RSS |
| 切换期间服务中断 | 切换窗口 < 5 分钟，提前通知用户 |
| Agent 崩溃无降级 | 保留 DeepSeek 直连作为 fallback：Agent 不可用时自动切回简单 API 调用 |
| AI 响应慢（10s+） | v1 同步等待；v2 评估流式推送（Pi Agent 天然支持事件流） |

## 7. 质量保障

```
TDD 流程（每个模块必须遵循）：

  ❌ 写失败测试 → ⚠️ 最小实现通过 → ✅ 重构优化
       红             黄              绿
```

**测试层级：**
- **单元测试**（vitest）：services、repositories、agent 逻辑
- **集成测试**：API 端点 + 数据库交互
- **回归测试**：复用 `api_test.sh` 确保与 Java 版 API 完全兼容
- **E2E 测试**：Flutter 客户端全链路验证

## 8. 关键参考文件

| 文件 | 用途 |
|------|------|
| `server/src/main/java/com/abao/` | Java 后端源码（重写参考） |
| `server/scripts/api_test.sh` | 31 个 API 测试用例（回归测试基准） |
| `server/src/main/resources/db/init.sql` | 数据库初始化脚本（schema 不变） |
| `doc/chat/Agent-Migration-Guide.md` | Pi Agent 框架完整文档 |
| `doc/chat/pi/soul.md` | AI 人格定义 |
| `doc/chat/pi/context.md` | 记忆架构 + 沙盒方案细节 |
