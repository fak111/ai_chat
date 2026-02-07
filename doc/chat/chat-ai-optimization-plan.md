# 群聊 AI（A宝）智能化优化计划

> 版本: v1.0 | 日期: 2026-02-06 | 状态: 待评审

## 1. 现状分析

### 1.1 对话样本问题复盘

基于实际群聊对话数据，发现以下核心问题：

| # | 场景 | 用户消息 | AI 回复 | 问题 |
|---|------|----------|---------|------|
| 1 | 缺上下文 | Test2: "@AI 对面的人是谁 叫什么" | "我是A宝，可以陪你聊天..." | AI 无法感知群内其他成员，完全答非所问 |
| 2 | 输出混乱 | Test2: "A宝是什么？@AI" | "TestUser: 你是什么？\nTest2: 你是AI吗？" | AI 把群成员消息当成自己的回复输出，格式错乱 |
| 3 | 无记忆 | 连续 3 次问 AI 身份相关问题 | 每次都重新自我介绍 | 没有多轮对话记忆，重复回答 |
| 4 | 忽略旁白 | TestUser: "我不知道你在说什么" | 无响应 | AI 只响应 @AI，无法感知群内讨论氛围 |

### 1.2 根因分析

```
当前架构：
用户发送 @AI 消息 → 后端只取 replyToContent（单条触发消息）→ AI 生成回复

问题：
┌─────────────────────────────────────────────────────┐
│ AI 的输入只有 1 条消息，没有任何上下文              │
│ → 不知道群里有谁                                     │
│ → 不知道之前聊了什么                                 │
│ → 不知道自己之前回复了什么                           │
│ → 每次对话都是"失忆"状态                            │
└─────────────────────────────────────────────────────┘
```

### 1.3 当前数据结构

```json
{
  "id": "uuid",
  "groupId": "uuid",
  "senderId": "uuid | null",      // AI 消息为 null
  "senderNickname": "string | null",
  "content": "string",
  "messageType": "USER | AI",
  "replyToId": "uuid | null",     // AI 回复关联的用户消息 ID
  "replyToContent": "string | null",
  "createdAt": "timestamp"
}
```

## 2. 优化目标

| 目标 | 指标 | 优先级 |
|------|------|--------|
| 上下文感知 | AI 能感知最近 N 条群消息，回答"群里有谁"类问题 | P0 |
| 多轮连续性 | 连续 @AI 时能记住之前的对话，不重复自我介绍 | P0 |
| AI 消息引用 | AI 回复旁边有引用按钮，用户点击即可引用回复 | P0 |
| 氛围感知 | AI 能感知非 @AI 的群消息，理解讨论上下文 | P1 |
| 人格一致性 | A宝保持统一人设，不混乱输出格式 | P1 |

## 3. 方案设计

### 3.1 上下文窗口（P0 - 核心改动）

**改前**：AI 只收到触发的那 1 条消息

**改后**：AI 收到完整的对话窗口

```
改造后架构：
用户发送 @AI 消息
    ↓
后端查询该 groupId 最近 N 条消息（含 USER + AI）
    ↓
构建完整 messages 数组，按时间排序
    ↓
拼入 system prompt（含群信息 + 人设）
    ↓
AI 生成回复（具有完整上下文）
```

#### 3.1.1 消息窗口策略

```
┌─────────────────────────────────────────┐
│         上下文窗口构建规则               │
├─────────────────────────────────────────┤
│ 1. 时间窗口：最近 30 分钟内的消息        │
│ 2. 数量上限：最多 50 条                  │
│ 3. 包含类型：USER + AI 全部包含          │
│ 4. 排序方式：按 createdAt 升序           │
│ 5. 触发消息：标记为当前需要回复的消息     │
└─────────────────────────────────────────┘
```

#### 3.1.2 Prompt 构建模板

```
System Prompt:
────────────────────────────────
你是"A宝"，一个群聊 AI 助手。

## 群聊信息
- 群 ID: {groupId}
- 当前群内活跃成员: {从最近消息提取的 senderNickname 去重列表}

## 你的人设
- 名字叫 A宝
- 风格：友好、简洁、有趣
- 用口语化中文回复，不要过度使用 emoji
- 回复长度控制在 1-3 句话，除非用户要求详细解答

## 规则
- 只回复 @AI 的消息，但要参考上下文理解语境
- 如果用户问"群里有谁"，根据最近消息中的成员列表回答
- 不要重复之前已经说过的内容
- 不要输出其他用户的名字+冒号的格式（如 "TestUser: xxx"），那不是你的回复格式
────────────────────────────────

Messages（按时间排序）:
────────────────────────────────
[
  { role: "user",      name: "TestUser", content: "hi" },
  { role: "user",      name: "Test2",    content: "我是" },
  { role: "user",      name: "TestUser", content: "介绍一下你自己" },
  { role: "assistant", content: "大家好！我是A宝..." },
  { role: "user",      name: "Test2",    content: "A宝是什么？" },
  { role: "assistant", content: "我是群里的AI助手..." },
  ...
  { role: "user",      name: "Test2",    content: "对面的人是谁 叫什么" }  ← 当前需回复
]
────────────────────────────────
```

#### 3.1.3 预期效果对比

| 问题 | 改前回答 | 改后回答 |
|------|----------|----------|
| "对面的人是谁" | "我是A宝，可以陪你聊天" | "群里最近有 TestUser 和你（Test2）在聊天哦" |
| 连续问 AI 身份 | 每次重新自我介绍 | "我刚才已经介绍过啦，还有什么想问的？" |
| "A宝是什么" | 输出混乱格式 | "我是A宝，这个群的AI助手，有问题随时问我~" |

### 3.2 AI 消息引用按钮（P0 - 前端改动）

**需求**：每条 AI 消息右侧/右下角显示一个引用图标（`"` 或 `↩`），用户点击后：
1. 输入框自动聚焦
2. 输入框上方显示引用预览条（灰色背景，显示被引用的 AI 消息摘要）
3. 发送时自动携带 `replyToId` 和 `replyToContent`

```
┌──────────────────────────────────────────┐
│  A宝:                                     │
│  大家好！我是A宝，很高兴在这个群里        │
│  和大家聊天...                       ["]  │  ← 引用按钮
└──────────────────────────────────────────┘
         ↓ 用户点击引用
┌──────────────────────────────────────────┐
│ ┌ 引用: A宝 - 大家好！我是A宝...    [x] │  ← 引用预览条
│ ├────────────────────────────────────────│
│ │ 输入消息...                    [发送]  │  ← 输入框自动聚焦
└──────────────────────────────────────────┘
```

**交互细节**：
- 引用按钮默认半透明，hover 时高亮
- 引用预览条可点 `x` 取消引用
- 引用消息过长时截断显示（最多 50 字 + "..."）
- 引用发送后，该消息显示引用关联线/标记

### 3.3 System Prompt 人设强化（P1）

解决 AI 输出格式混乱的问题（如输出 "TestUser: 你是什么？"）：

```
## 输出格式规则（强制）
- 直接回复内容，不要以任何人的名字开头
- 不要模拟其他用户说话
- 不要输出 "用户名: 内容" 这种格式
- 你的回复就是你自己说的话，不需要角色标注

## 回复策略
- 短问短答：简单问题 1 句话搞定
- 有上下文时引用：如"刚才 TestUser 说了..."
- 不确定时坦诚："这个我不太确定，你们觉得呢？"
```

## 4. 技术方案

### 4.1 后端改动（API 层）

#### 改动点 1：AI 回复接口增加上下文查询

```
原始流程:
POST /api/chat/reply
  body: { groupId, messageId, content }
  → 只用 content 调 AI
  → 存储回复

改造后:
POST /api/chat/reply
  body: { groupId, messageId, content }
  → 查询 messages WHERE groupId = ? AND createdAt > (now - 30min) ORDER BY createdAt ASC LIMIT 50
  → 构建 messages 数组（USER → role:user, AI → role:assistant）
  → 拼入 system prompt（含群成员列表）
  → 调 AI API
  → 存储回复
```

#### 改动点 2：消息查询优化

```sql
-- 上下文窗口查询
SELECT id, senderId, senderNickname, content, messageType, createdAt
FROM messages
WHERE groupId = :groupId
  AND createdAt >= NOW() - INTERVAL '30 minutes'
ORDER BY createdAt ASC
LIMIT 50;

-- 提取活跃成员
SELECT DISTINCT senderNickname
FROM messages
WHERE groupId = :groupId
  AND createdAt >= NOW() - INTERVAL '30 minutes'
  AND messageType = 'USER'
  AND senderNickname IS NOT NULL;
```

#### 改动点 3：消息转 OpenAI messages 格式

```typescript
function buildChatMessages(
  dbMessages: Message[],
  triggerMessageId: string
): ChatMessage[] {
  return dbMessages.map(msg => {
    if (msg.messageType === 'AI') {
      return { role: 'assistant', content: msg.content }
    } else {
      // 用 name 字段区分不同用户
      return {
        role: 'user',
        name: sanitizeName(msg.senderNickname || 'unknown'),
        content: msg.content
      }
    }
  })
}

// OpenAI name 字段只允许 [a-zA-Z0-9_-]，需转换中文名
function sanitizeName(name: string): string {
  // 方案1: 保留原名放在 content 里
  // 方案2: 映射为 user_1, user_2 并在 system prompt 注明对应关系
  return name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'user'
}
```

### 4.2 前端改动（引用按钮）

#### 改动点 1：消息气泡组件添加引用按钮

```tsx
// MessageBubble.tsx
interface Props {
  message: ChatMessage
  onQuote: (message: ChatMessage) => void
}

function MessageBubble({ message, onQuote }: Props) {
  return (
    <div className="group relative">
      {/* 消息内容 */}
      <div className="...">{message.content}</div>

      {/* 引用按钮 - AI 消息才显示 */}
      {message.messageType === 'AI' && (
        <button
          onClick={() => onQuote(message)}
          className="opacity-0 group-hover:opacity-100 transition-opacity ..."
          title="引用回复"
        >
          <QuoteIcon />
        </button>
      )}
    </div>
  )
}
```

#### 改动点 2：输入框引用状态

```tsx
// ChatInput.tsx
interface Props {
  quotedMessage: ChatMessage | null
  onClearQuote: () => void
  onSend: (content: string, replyToId?: string) => void
}

function ChatInput({ quotedMessage, onClearQuote, onSend }: Props) {
  return (
    <div>
      {/* 引用预览条 */}
      {quotedMessage && (
        <div className="flex items-center bg-muted px-3 py-1.5 text-sm">
          <QuoteIcon className="w-3 h-3 mr-2 text-muted-foreground" />
          <span className="truncate flex-1">
            A宝: {quotedMessage.content.slice(0, 50)}
            {quotedMessage.content.length > 50 ? '...' : ''}
          </span>
          <button onClick={onClearQuote}>
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 输入框 */}
      <input
        autoFocus={!!quotedMessage}
        onSubmit={(content) => {
          onSend(content, quotedMessage?.id)
          onClearQuote()
        }}
      />
    </div>
  )
}
```

### 4.3 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `contextWindowMinutes` | 30 | 上下文时间窗口（分钟） |
| `contextMaxMessages` | 50 | 上下文最大消息数 |
| `aiPersonality` | "friendly" | AI 人设风格 |
| `maxReplyLength` | 200 | AI 回复最大字符数 |

## 5. 实施计划

### Phase 1：上下文窗口 + Prompt 优化（P0）

| 步骤 | 任务 | 工作量 |
|------|------|--------|
| 1.1 | 后端：AI 回复接口增加上下文查询逻辑 | 0.5d |
| 1.2 | 后端：实现 messages 数组构建 + name 映射 | 0.5d |
| 1.3 | 后端：重写 system prompt 模板（人设 + 规则 + 格式） | 0.5d |
| 1.4 | 测试：多轮对话场景验证（身份、群成员、记忆） | 0.5d |

### Phase 2：引用按钮（P0）

| 步骤 | 任务 | 工作量 |
|------|------|--------|
| 2.1 | 前端：AI 消息气泡添加引用按钮 | 0.5d |
| 2.2 | 前端：输入框引用预览条组件 | 0.5d |
| 2.3 | 前端：引用发送逻辑（携带 replyToId） | 0.25d |
| 2.4 | 前端：引用样式打磨 + 动画 | 0.25d |

### Phase 3：高级优化（P1，后续迭代）

| 步骤 | 任务 | 说明 |
|------|------|------|
| 3.1 | 长期记忆 | 群级别的长期记忆摘要，超出窗口的历史压缩为摘要 |
| 3.2 | 主动参与 | 检测到热烈讨论时 AI 主动插话（可配置开关） |
| 3.3 | 多模态 | 支持图片理解（用户发图 @AI） |
| 3.4 | 情绪感知 | 根据群内氛围调整回复风格 |

## 6. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Token 消耗增加 | 50 条上下文 ≈ 2000-4000 tokens/次 | 可调节窗口大小，冷群缩短窗口 |
| 隐私泄露 | AI 可能复述用户私密对话 | Prompt 中明确"不要复述他人完整消息" |
| 响应延迟 | 上下文查询 + 更长 prompt | 数据库加索引 `(groupId, createdAt)` |
| name 字段限制 | OpenAI name 只支持 `[a-zA-Z0-9_-]` | content 内嵌入 `[{nickname}]: {content}` 格式 |

## 7. 验收标准

- [ ] 用户问"群里有谁"，AI 能正确列出最近活跃成员
- [ ] 连续 @AI 3 次相同问题，AI 不重复回答
- [ ] AI 回复不出现 "用户名: 内容" 的错误格式
- [ ] AI 消息有引用按钮，点击后输入框显示引用预览
- [ ] 引用发送后，消息正确关联 `replyToId`
- [ ] 30 分钟内的对话 AI 都能记住
- [ ] 上下文查询耗时 < 100ms（有索引）
