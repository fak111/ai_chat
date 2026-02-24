# A宝 API Specification v1

> 本文档定义 A宝 API 的**设计决策与规范约定**（管「为什么」）。
> 具体端点的参数、响应、示例以 `/api/docs`（Swagger UI 自动生成）为准（管「是什么」）。
> 参考 Discord API v10、Telegram Bot API、Slack Web API 的实战模式，取其精华。

---

## 0. 文档策略：路线 B — 代码即文档（Code as Spec）

**核心原则**：代码是唯一真相源，文档从代码自动生成，杜绝手动同步。

### 分工

| 文档 | 内容 | 维护方式 |
|------|------|---------|
| **本文档** (`API-Specification.md`) | 设计决策、规范约定、错误码体系、协议设计 | 手动维护，变动极少 |
| **`/api/docs`** (Swagger UI) | 具体端点、请求参数、响应结构、示例 | Zod schema → zod-to-openapi → 自动生成 |
| **`types/index.ts`** | TypeScript 类型定义 | 从 Zod schema 推导（`z.infer<typeof XxxSchema>`） |

### 技术方案

```
Zod schema（请求/响应定义）
    │
    ├──→ 运行时参数验证（替代手动 if/else）
    ├──→ TypeScript 类型推导（替代手动 interface）
    └──→ zod-to-openapi → OpenAPI 3.x spec → Swagger UI 自动渲染
```

### 新增 API 流程

```
1. 确认设计决策（需要新错误码？新模块？查本文档，大部分沿用即可）
2. 写 Zod schema（请求 + 响应） → 一次定义，验证/类型/文档三合一
3. 注册到 OpenAPI registry + 写路由逻辑
4. /api/docs 自动更新，无需手动同步
```

### 已有 API 规范化（渐进式迁移）

```
不一次性改完。改一个路由 → 加 Zod schema → 注册 OpenAPI registry
→ 该端点文档自动生成。没改的暂不出现。改完所有 = 100% 覆盖。
```

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| HTTP 状态码即信号 | 成功用 2xx，客户端错误用 4xx，服务端错误用 5xx。不搞 Slack 式「永远 200」 |
| 成功响应裸返回 | 成功时直接返回业务数据（对象或数组），不套 `{ code, data }` 信封。与 Discord 一致 |
| 错误响应统一信封 | 所有错误返回 `{ code, message }` 结构体，机器可读 + 人类可读 |
| URL 路径版本化 | `/api/v1/...`，Android 客户端发出去就收不回来，必须版本隔离 |
| 游标分页 | 消息历史用 ID 游标（`before`/`after`），不用 offset，避免插入导致偏移漂移 |
| 向后兼容 | 同一大版本内只加字段不删字段，新增端点不影响旧客户端 |

---

## 2. Base URL & 版本化

```
生产环境:  https://api.abao.app/v1
开发环境:  http://localhost:8080/api/v1
```

### 版本策略

| 场景 | 做法 |
|------|------|
| 新增字段/端点 | v1 内直接加，向后兼容 |
| 破坏性变更（改字段名、删端点、改响应结构） | 发布 v2，v1 保留 6 个月过渡期 |
| 废弃字段 | 标记 `deprecated`，下个大版本移除 |

### 路由挂载

```typescript
// app.ts
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/app', appRoutes);       // 版本检查等
app.use('/api/health', healthRoutes);     // health 不加版本，永远可达
```

---

## 3. 认证

### 3.1 Token 类型

| 类型 | 格式 | 用途 | 有效期 |
|------|------|------|--------|
| Access Token | JWT | API 请求认证 | 15 分钟 |
| Refresh Token | opaque UUID | 刷新 Access Token | 30 天 |

### 3.2 请求头

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

### 3.3 Token 刷新流程

```
Client                              Server
  │                                    │
  ├── API 请求 ─────────────────────▶ │
  │                                    ├── 401 Unauthorized
  │ ◀──────────────────────────────── │
  │                                    │
  ├── POST /api/v1/auth/refresh ────▶ │
  │   { refreshToken: "xxx" }         ├── 200 { accessToken, refreshToken }
  │ ◀──────────────────────────────── │
  │                                    │
  ├── 原请求重试（新 token）──────────▶ │
  │                                    ├── 200 OK
  │ ◀──────────────────────────────── │
```

### 3.4 未来扩展：Bot Token

为后续开放平台预留，格式前缀区分：

```
用户 Token:  Bearer eyJhbGci...        (JWT)
Bot Token:   Bearer abao_bot_xxx...    (opaque, 长期有效)
```

---

## 4. HTTP 响应规范

### 4.1 成功响应 — 裸返回

```http
HTTP/1.1 200 OK
Content-Type: application/json

// 单个对象
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "技术群",
  "inviteCode": "ABC123",
  "createdAt": "2025-03-15T10:30:00.000Z"
}

// 数组
[
  { "id": "...", "name": "技术群" },
  { "id": "...", "name": "摸鱼群" }
]

// 创建成功
HTTP/1.1 201 Created

// 无内容
HTTP/1.1 204 No Content
```

### 4.2 错误响应 — 统一信封

**所有错误**使用同一结构：

```json
{
  "code": 10003,
  "message": "Group not found"
}
```

带字段级验证详情时：

```json
{
  "code": 20001,
  "message": "Validation failed",
  "errors": {
    "email": "Invalid email format",
    "password": "Must be at least 8 characters"
  }
}
```

### 4.3 HTTP 状态码使用

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | OK | 查询、更新成功 |
| 201 | Created | 创建资源成功（注册、建群、发消息） |
| 204 | No Content | 删除成功、登出 |
| 400 | Bad Request | 请求体格式错误 |
| 401 | Unauthorized | 未登录 / Token 过期 |
| 403 | Forbidden | 权限不足（非群成员访问群消息） |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（邮箱已注册、已在群中） |
| 422 | Unprocessable Entity | 参数验证失败（Zod 校验） |
| 429 | Too Many Requests | 触发限流 |
| 500 | Internal Server Error | 服务端未捕获异常 |

### 4.4 错误码体系

采用 **5 位数字**，前两位为模块，后三位为具体错误：

| 范围 | 模块 | 示例 |
|------|------|------|
| 10xxx | 通用 | 10001 Unknown error, 10003 Resource not found |
| 20xxx | 认证 | 20001 Invalid credentials, 20002 Token expired, 20003 Email not verified |
| 30xxx | 用户 | 30001 Email already registered, 30002 Invalid email format |
| 40xxx | 群聊 | 40001 Group not found, 40002 Invalid invite code, 40003 Already in group |
| 50xxx | 消息 | 50001 Message too long, 50002 Empty content |
| 60xxx | AI | 60001 AI service unavailable, 60002 Rate limit exceeded |
| 70xxx | 文件 | 70001 File too large, 70002 Invalid file type |

**前端使用方式**：用 `code` 做逻辑分支（如 20003 → 跳转验证页），用 `message` 做用户提示。

---

## 5. 分页规范

### 5.1 消息历史 — ID 游标分页（Discord 模式）

```http
GET /api/v1/messages/group/{groupId}?before={messageId}&limit=50
GET /api/v1/messages/group/{groupId}?after={messageId}&limit=50
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| before | string (UUID) | - | 获取此 ID 之前的消息（向上翻页） |
| after | string (UUID) | - | 获取此 ID 之后的消息（向下翻页） |
| limit | number | 50 | 每页条数，最大 100 |

- `before` 和 `after` 互斥，同时传则忽略 `after`
- 不传游标 = 获取最新消息
- 返回数组长度 < `limit` 表示到头了

**响应**：直接返回消息数组（按时间倒序）。

```json
[
  { "id": "msg-003", "content": "最新消息", "createdAt": "..." },
  { "id": "msg-002", "content": "较早消息", "createdAt": "..." },
  { "id": "msg-001", "content": "最早消息", "createdAt": "..." }
]
```

### 5.2 列表资源 — 简单偏移分页

群聊列表等非高频场景，用传统分页：

```http
GET /api/v1/groups?page=0&size=20
```

**响应**：

```json
{
  "items": [ ... ],
  "total": 42,
  "page": 0,
  "size": 20,
  "hasMore": true
}
```

---

## 6. 限流

### 6.1 限流策略

| 端点类别 | 窗口 | 限制 | 说明 |
|---------|------|------|------|
| 全局 | 1 分钟 | 120 次/用户 | 所有 API 共享 |
| 认证 | 15 分钟 | 10 次/IP | 登录、注册 |
| 发消息 | 10 秒 | 10 次/用户/群 | 防刷屏 |
| AI 触发 | 1 分钟 | 5 次/用户 | 防滥用 |

### 6.2 响应头

```http
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1702394432
Retry-After: 30                    # 仅 429 时返回（秒）
```

### 6.3 被限流时

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30

{
  "code": 10429,
  "message": "Rate limit exceeded. Retry after 30 seconds."
}
```

---

## 7. 日期时间格式

**统一使用 ISO 8601 UTC**：

```
2025-03-15T10:30:00.000Z
```

- 后端存储和返回一律 UTC
- 前端负责转换为本地时区显示
- 字段命名统一 `xxxAt` 后缀：`createdAt`, `updatedAt`, `joinedAt`

---

## 8. 字段命名规范

| 层级 | 规范 | 示例 |
|------|------|------|
| JSON 响应体 | camelCase | `inviteCode`, `messageType`, `createdAt` |
| URL 路径参数 | camelCase | `/groups/:groupId/messages` |
| URL 查询参数 | camelCase | `?beforeId=xxx&limit=50` |
| 数据库字段 | snake_case | `invite_code`, `message_type`, `created_at` |

后端 Service 层负责 snake_case → camelCase 转换，Routes 层只接触 camelCase。

---

## 9. API 端点全览

> **注意**：本章节为设计阶段参考，记录端点规划与状态。
> Zod schema + zod-to-openapi 落地后，具体参数/响应以 `/api/docs` 自动生成文档为准。

### 9.1 认证模块 `/api/v1/auth`

| 方法 | 路径 | 认证 | 说明 | 状态 |
|------|------|------|------|------|
| POST | `/register` | - | 注册 | done |
| POST | `/login` | - | 登录 | done |
| POST | `/refresh` | - | 刷新 Token | done |
| POST | `/logout` | Bearer | 登出 | done |
| POST | `/verify` | - | 验证邮箱（POST） | done |
| GET | `/verify` | - | 验证邮箱（链接） | done |
| GET | `/me` | Bearer | 当前用户信息 | done |
| PUT | `/profile` | Bearer | 更新个人资料 | done |
| POST | `/avatar` | Bearer | 上传头像 | done |
| PUT | `/password` | Bearer | 修改密码 | todo |
| POST | `/forgot-password` | - | 忘记密码（发邮件） | todo |
| POST | `/reset-password` | - | 重置密码（邮件链接） | todo |

#### POST `/register`

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "MyPassword123",
  "nickname": "Cool Guy"
}
```

**201 Created**
```json
{
  "id": "550e8400-...",
  "email": "user@example.com",
  "nickname": "Cool Guy",
  "avatarUrl": null,
  "createdAt": "2025-03-15T10:30:00.000Z"
}
```

**409 Conflict** — 邮箱已注册
```json
{ "code": 30001, "message": "Email already registered" }
```

#### POST `/login`

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "MyPassword123"
}
```

**200 OK**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "a1b2c3d4-...",
  "user": {
    "id": "550e8400-...",
    "email": "user@example.com",
    "nickname": "Cool Guy",
    "avatarUrl": "/uploads/avatars/xxx.jpg",
    "createdAt": "2025-03-15T10:30:00.000Z"
  }
}
```

**401 Unauthorized** — 密码错误
```json
{ "code": 20001, "message": "Invalid credentials" }
```

**403 Forbidden** — 邮箱未验证
```json
{ "code": 20003, "message": "Email not verified" }
```

### 9.2 群聊模块 `/api/v1/groups`

| 方法 | 路径 | 认证 | 说明 | 状态 |
|------|------|------|------|------|
| POST | `/` | Bearer | 创建群聊 | done |
| POST | `/join` | Bearer | 加入群聊 | done |
| GET | `/` | Bearer | 我的群聊列表 | done |
| GET | `/:groupId` | Bearer | 群聊详情（含成员） | done |
| GET | `/:groupId/invite` | Bearer | 获取邀请码 | done |
| DELETE | `/:groupId/leave` | Bearer | 退出群聊 | done |
| PUT | `/:groupId` | Bearer | 修改群设置（群名等） | todo |
| DELETE | `/:groupId/members/:userId` | Bearer | 踢出成员 | todo |
| PUT | `/:groupId/members/:userId/role` | Bearer | 设置成员角色 | todo |

#### POST `/`

```http
POST /api/v1/groups
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "name": "摸鱼技术群"
}
```

**201 Created**
```json
{
  "id": "group-uuid-...",
  "name": "摸鱼技术群",
  "inviteCode": "ABC123",
  "createdAt": "2025-03-15T10:30:00.000Z"
}
```

#### GET `/`

```http
GET /api/v1/groups
Authorization: Bearer eyJ...
```

**200 OK**
```json
[
  {
    "id": "group-uuid-...",
    "name": "摸鱼技术群",
    "inviteCode": "ABC123",
    "memberCount": 5,
    "createdAt": "2025-03-15T10:30:00.000Z",
    "updatedAt": "2025-03-16T08:00:00.000Z",
    "lastMessage": "大家好呀~",
    "lastMessageAt": "2025-03-16T08:00:00.000Z",
    "unreadCount": 3
  }
]
```

#### GET `/:groupId`

**200 OK**
```json
{
  "id": "group-uuid-...",
  "name": "摸鱼技术群",
  "inviteCode": "ABC123",
  "createdAt": "2025-03-15T10:30:00.000Z",
  "members": [
    {
      "id": "member-uuid",
      "userId": "user-uuid",
      "nickname": "Cool Guy",
      "avatarUrl": "/uploads/avatars/xxx.jpg",
      "isAi": false,
      "joinedAt": "2025-03-15T10:30:00.000Z"
    },
    {
      "id": "member-uuid-2",
      "userId": null,
      "nickname": "A宝",
      "avatarUrl": null,
      "isAi": true,
      "joinedAt": "2025-03-15T10:30:00.000Z"
    }
  ]
}
```

### 9.3 消息模块 `/api/v1/messages`

| 方法 | 路径 | 认证 | 说明 | 状态 |
|------|------|------|------|------|
| POST | `/group/:groupId` | Bearer | 发送消息 | done |
| GET | `/group/:groupId` | Bearer | 消息历史（游标分页） | done |
| GET | `/group/:groupId/recent` | Bearer | 最近 N 条消息 | done |
| GET | `/:messageId` | Bearer | 单条消息详情 | done |
| DELETE | `/:messageId` | Bearer | 撤回消息 | todo |

#### POST `/group/:groupId`

```http
POST /api/v1/messages/group/group-uuid
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "content": "Hello World!",
  "replyToId": null
}
```

**201 Created**
```json
{
  "id": "msg-uuid-...",
  "groupId": "group-uuid-...",
  "senderId": "user-uuid-...",
  "senderNickname": "Cool Guy",
  "content": "Hello World!",
  "messageType": "USER",
  "replyToId": null,
  "replyToContent": null,
  "createdAt": "2025-03-16T08:00:00.000Z"
}
```

#### GET `/group/:groupId` — 游标分页

```http
GET /api/v1/messages/group/group-uuid?before=msg-uuid-003&limit=50
Authorization: Bearer eyJ...
```

**200 OK** — 直接返回数组，按时间倒序
```json
[
  { "id": "msg-002", "content": "...", "createdAt": "..." },
  { "id": "msg-001", "content": "...", "createdAt": "..." }
]
```

### 9.4 应用模块 `/api/v1/app`

| 方法 | 路径 | 认证 | 说明 | 状态 |
|------|------|------|------|------|
| GET | `/version` | - | 客户端版本检查 | todo |
| GET | `/config` | - | 客户端动态配置 | todo |

#### GET `/version`

```http
GET /api/v1/app/version?platform=android&current=1.0.0
```

**200 OK**
```json
{
  "latest": "1.2.0",
  "minimum": "1.0.0",
  "downloadUrl": "https://github.com/user/ai_chat/releases/download/v1.2.0/abao-1.2.0.apk",
  "changelog": "- AI 主动插话更聪明了\n- 修复消息偶尔丢失的问题",
  "forceUpdate": false
}
```

前端逻辑：

```
current < minimum  → forceUpdate = true，强制更新弹窗（不可关闭）
current < latest   → 温和提示（可跳过，24h 内不再提醒）
current >= latest  → 无操作
```

### 9.5 健康检查 `/api/health`

```http
GET /api/health
```

**200 OK**
```json
{
  "status": "ok",
  "version": "1.5.0",
  "uptime": 86400
}
```

> 不加版本前缀，永远可达。运维 / 负载均衡探针用。

---

## 10. WebSocket 协议

### 10.1 连接

```
ws://localhost:8080/ws?token=eyJhbGci...
```

> Token 通过 query string 传递（WebSocket 不支持自定义 Header）。

### 10.2 帧格式（参考 Discord Gateway）

所有 WebSocket 帧统一为 JSON，结构：

```json
{
  "op": 0,
  "t": "MESSAGE_CREATE",
  "d": { ... },
  "s": 42
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| op | number | 操作码（见下表） |
| t | string \| null | 事件类型（仅 op=0 DISPATCH 时有值） |
| d | object \| null | 数据负载 |
| s | number \| null | 序列号（仅服务端 DISPATCH 时递增） |

### 10.3 操作码

| op | 名称 | 方向 | 说明 |
|----|------|------|------|
| 0 | DISPATCH | S→C | 业务事件分发 |
| 1 | HEARTBEAT | C→S | 心跳 |
| 2 | IDENTIFY | C→S | 认证（连接后首条消息） |
| 3 | SUBSCRIBE | C→S | 订阅群聊消息 |
| 4 | UNSUBSCRIBE | C→S | 取消订阅 |
| 5 | CLIENT_EVENT | C→S | 客户端操作（发消息等） |
| 10 | HELLO | S→C | 连接成功，返回心跳间隔 |
| 11 | HEARTBEAT_ACK | S→C | 心跳确认 |
| 12 | RECONNECT | S→C | 服务端要求重连 |

### 10.4 连接生命周期

```
Client                              Server
  │                                    │
  ├── WebSocket 连接 ────────────────▶ │
  │                                    │
  │  op:10 HELLO                       │
  │  { heartbeatInterval: 30000 }      │
  │ ◀──────────────────────────────── │
  │                                    │
  ├── op:2 IDENTIFY ─────────────────▶ │
  │   { token: "eyJ..." }             │
  │                                    │
  │  op:0 DISPATCH t:READY             │
  │  { user: {...}, groups: [...] }    │
  │ ◀──────────────────────────────── │
  │                                    │
  │  ═══ 正常通信循环 ═══              │
  │                                    │
  ├── op:1 HEARTBEAT ────────────────▶ │
  │ ◀── op:11 HEARTBEAT_ACK ──────── │
  │                                    │
  ├── op:3 SUBSCRIBE ────────────────▶ │
  │   { groupId: "xxx" }              │
  │                                    │
  │  op:0 DISPATCH t:MESSAGE_CREATE    │
  │  { message: {...} }                │
  │ ◀──────────────────────────────── │
  │                                    │
  ├── op:5 CLIENT_EVENT ─────────────▶ │
  │   { action: "SEND_MESSAGE",        │
  │     groupId: "xxx",                │
  │     content: "hello" }             │
  │                                    │
```

### 10.5 DISPATCH 事件类型

| t (事件类型) | d (数据) | 说明 |
|-------------|----------|------|
| READY | `{ user, groups }` | 认证成功 |
| MESSAGE_CREATE | `{ message: MessageDto }` | 新消息 |
| AI_STREAM_START | `{ groupId, streamId, replyToId }` | AI 开始流式回复 |
| AI_STREAM_DELTA | `{ groupId, streamId, delta }` | AI 流式文本片段 |
| AI_STREAM_TOOL | `{ groupId, streamId, toolName, status }` | AI 工具调用状态 |
| AI_STREAM_END | `{ groupId, streamId, message }` | AI 回复完成 |
| GROUP_MEMBER_JOIN | `{ groupId, member }` | 新成员加入 |
| GROUP_MEMBER_LEAVE | `{ groupId, userId }` | 成员退出 |
| TYPING_START | `{ groupId, userId, nickname }` | 正在输入 |
| PRESENCE_UPDATE | `{ userId, status }` | 在线状态变更（future） |

### 10.6 心跳机制

- 服务端通过 HELLO 下发 `heartbeatInterval`（默认 30 秒）
- 客户端按间隔发送 `op:1 HEARTBEAT`
- 服务端回复 `op:11 HEARTBEAT_ACK`
- 客户端连续 **2 次** 未收到 ACK → 断开重连

### 10.7 断线重连（Future）

> 当前版本暂不实现序列号重放，仅做简单重连。Phase 2 加入。

完整重连流程（参考 Discord Resume）：
1. 客户端记录最后收到的序列号 `s`
2. 断线后重连，发送 RESUME（新 op 码）携带 `{ token, lastSequence }`
3. 服务端回放 `lastSequence` 之后的所有 DISPATCH 事件
4. 回放完成后恢复正常推送

---

## 11. 版本检查与应用更新

### 11.1 更新决策矩阵

```
App 启动 / 从后台恢复
    │
    ├── GET /api/v1/app/version?platform=android&current=1.0.0
    │
    ├── current < minimum  ──→ 强制更新（全屏弹窗，不可关闭）
    │                          后端有破坏性 API 变更时使用
    │
    ├── current < latest   ──→ 温和提示（底部 SnackBar / 弹窗，可跳过）
    │                          24h 内不再提醒
    │
    └── current >= latest  ──→ 正常使用，无提示
```

### 11.2 后端维护通知

服务端需要维护时，通过 WebSocket 推送：

```json
{
  "op": 0,
  "t": "MAINTENANCE_SCHEDULED",
  "d": {
    "startsAt": "2025-03-20T02:00:00.000Z",
    "estimatedMinutes": 30,
    "message": "系统升级维护，预计 30 分钟"
  }
}
```

前端收到后展示 Banner 提示。

---

## 12. 安全规范

### 12.1 传输

| 环境 | 协议 |
|------|------|
| 生产 | HTTPS + WSS（TLS 1.2+） |
| 开发 | HTTP + WS（本地开发） |

### 12.2 请求验证

- 所有写操作必须验证请求体（Zod schema）
- 所有需要认证的端点挂 `authRequired` 中间件
- 群聊操作验证用户是否为群成员
- 文件上传限制：头像 5MB，单文件 20MB

### 12.3 敏感信息

- 响应中**永不返回** `password_hash`, `verification_token`, `refresh_token`（refresh_token 仅在登录/刷新时返回）
- 错误信息不暴露内部实现（如 SQL 错误详情）
- 日志脱敏：不记录密码、Token 全文

---

## 13. 当前实现 vs 规范差距

### 需要改动的

| 项目 | 当前状态 | 目标状态 | 优先级 |
|------|---------|---------|--------|
| URL 前缀 | `/api/auth` | `/api/v1/auth` | P0 |
| 错误响应 | `{ error: "..." }` | `{ code: 10003, message: "..." }` | P0 |
| HTTP 状态码 | 创建成功返回 200 | 创建成功返回 201 | P1 |
| 消息分页 | offset 分页 | ID 游标分页 (`before`/`after`) | P1 |
| 版本检查 | 无 | `GET /api/v1/app/version` | P1 |
| WS 协议 | `{ type, ... }` 扁平结构 | `{ op, t, d, s }` 结构 | P2 |
| 限流 | 无 | Redis 限流 + 响应头 | P2 |
| 心跳机制 | 简单 PING/PONG | HELLO + 间隔 + ACK | P2 |

### 实施建议

```
Phase 1 (立即): URL 版本化 + 统一错误码 + 版本检查端点
Phase 2 (近期): 游标分页 + 限流
Phase 3 (后续): WebSocket 协议升级 + 断线重连
```

> URL 版本化改动很小（改 app.ts 路由挂载 + 前端 baseUrl），但越晚改成本越高。
> 第一批 Android 用户拿到的 APK 就要走 `/api/v1/`，否则以后每次破坏性变更都是灾难。

---

## Appendix A: 完整错误码表

```
10001  Unknown error                    未知错误
10003  Resource not found               资源不存在
10429  Rate limit exceeded              请求过于频繁

20001  Invalid credentials              用户名或密码错误
20002  Token expired                    Token 已过期
20003  Email not verified               邮箱未验证
20004  Invalid refresh token            Refresh Token 无效
20005  Account disabled                 账号已被禁用

30001  Email already registered         邮箱已注册
30002  Invalid email format             邮箱格式错误
30003  Password too weak                密码强度不足
30004  Nickname too long                昵称超长

40001  Group not found                  群聊不存在
40002  Invalid invite code              邀请码无效
40003  Already in group                 已在该群中
40004  Not a group member               非群成员
40005  Group is full                    群聊已满
40006  Cannot leave as owner            群主不能直接退出

50001  Message too long                 消息超长（>5000 字符）
50002  Empty message content            消息内容为空
50003  Message not found                消息不存在
50004  Cannot delete others message     不能删除他人消息

60001  AI service unavailable           AI 服务不可用
60002  AI rate limit exceeded           AI 请求过于频繁
60003  AI context too long              上下文超长

70001  File too large                   文件过大
70002  Invalid file type                不支持的文件类型
```

## Appendix B: 前端 ApiService 适配示例

```dart
class ApiService {
  // 统一错误处理 — 解析 { code, message } 结构
  static ApiError extractError(DioException e) {
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      return ApiError(
        code: data['code'] as int? ?? 10001,
        message: data['message'] as String? ?? 'Unknown error',
        errors: data['errors'] as Map<String, dynamic>?,
      );
    }
    return ApiError(code: 10001, message: _fallbackMessage(e));
  }
}

class ApiError {
  final int code;
  final String message;
  final Map<String, dynamic>? errors;

  bool get isAuthError => code >= 20001 && code <= 20099;
  bool get isNotVerified => code == 20003;
  bool get isRateLimited => code == 10429;
}
```
