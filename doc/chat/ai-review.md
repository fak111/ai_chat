# AI 对话质量修复方案 - 代码审查报告

> 审查对象: `doc/chat/ai.md` (AI 对话质量问题分析与修复方案)
> 审查日期: 2026-02-06
> 审查范围: 方案与实际代码对照，验证根因准确性、修复完整性、遗漏风险

---

## 一、总体评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 根因分析准确性 | 8/10 | 3 个根因定位准确，行号精确，但遗漏了 2 个关键问题 |
| 修复方案完整性 | 5/10 | Fix 2 存在致命缺陷会直接报错；遗漏了多个真实 bug |
| 可执行性 | 6/10 | Fix 1/3/4 可直接执行，Fix 2 需要改造后才能落地 |
| 测试覆盖 | 4/10 | 现有测试未覆盖 replyTo 标注逻辑，验证方案偏手工 |

---

## 二、根因分析逐条验证

### 根因 1: System Prompt 与触发逻辑矛盾 -- CONFIRMED

**文档描述**: System prompt 写 "只回复 @AI 的消息"，但 `shouldTriggerAI()` 也处理引用 AI 消息的追问。

**代码验证**:
- `AIService.java:164` -- prompt 原文: `"只回复 @AI 的消息，但要参考上下文理解语境"`
- `AIService.java:71-87` -- `shouldTriggerAI()` 有两个触发条件:
  - `containsAIMention(message.getContent())` (line 77)
  - `message.getReplyTo() != null && message.getReplyTo().getMessageType() == MessageType.AI` (line 82)

**结论**: 确认矛盾存在。AI 收到一条不含 @AI 的追问消息，但 prompt 说"只回复 @AI 消息"，AI 的行为变得不可预测。

### 根因 2: Context 中缺少回复关系标注 -- CONFIRMED

**文档描述**: `buildContext()` 构建扁平时间线，AI 不知道哪条是追问。

**代码验证**:
- `AIService.java:118-140` -- 遍历所有消息时，USER 类型统一处理为 `displayName + ": " + extractUserMessage(content)`
- 完全没有检查 `msg.getReplyTo()` 来标注引用关系

**结论**: 确认。所有用户消息在 context 中长得一模一样，AI 无法区分"普通发言"和"对 AI 的追问"。

### 根因 3: 事件监听可能在事务提交前执行 -- CONFIRMED，但严重程度被低估

**文档描述**: `@Async @EventListener` 可能在事务 commit 前执行，概率低。

**代码验证**:
- `MessageService.java:67` -- `eventPublisher.publishEvent(new MessageSentEvent(this, saved))` 在 `@Transactional` 方法内
- `MessageEventListener.java:17-18` -- `@Async @EventListener`，独立线程执行
- `AIService.java:201` -- `buildContext()` 调用 `findContextWindow()` 查数据库

**文档说"概率低"，实际不然**:
- `@Async` handler 在**另一个线程**开启**新事务**来查询
- 原始事务此时可能还没 commit（还要走完 `sendMessage()` 剩余代码 + Spring AOP 收尾）
- 在并发稍高时，**trigger message 大概率不在 context 里**
- 这直接解释了"AI 给出与上一轮完全相同的回复" -- 因为 context 根本没变

---

## 三、修复方案逐条审查

### Fix 1: 更新 System Prompt -- OK，可直接执行

修改 `buildSystemPrompt()` 第 163-164 行:
```
- 只回复 @AI 的消息，但要参考上下文理解语境
+ 回复 @AI 的消息以及用户对你消息的追问回复
+ 参考上下文理解语境，特别关注最后一条用户消息
+ 不要重复之前已经说过的内容
```

**审查意见**: 合理。但建议更明确：
```
- 你会在两种情况下被触发回复：(1) 用户 @AI 提问  (2) 用户引用你之前的回复进行追问
- 无论哪种情况，都要重点理解最后一条用户消息的意图
- 严禁重复你之前已经回复过的内容
```

### Fix 2: Context 中标注回复关系 -- 有致命缺陷，需返工

**提议代码**:
```java
if (msg.getReplyTo() != null && msg.getReplyTo().getMessageType() == MessageType.AI) {
    String quoted = msg.getReplyTo().getContent();
    ...
}
```

**致命问题: `msg.getReplyTo()` 会触发 LazyInitializationException**

`Message.replyTo` 是 `FetchType.LAZY` (`Message.java:38-40`):
```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "reply_to_id")
private Message replyTo;
```

而 `findContextWindow` 查询 (`MessageRepository.java:24-25`) **只 fetch 了 sender，没有 fetch replyTo**:
```sql
SELECT m FROM Message m LEFT JOIN FETCH m.sender
WHERE m.group.id = :groupId AND m.createdAt >= :since
ORDER BY m.createdAt ASC LIMIT :limit
```

`processMessage()` 是 `@Async` 执行，运行在独立线程，原始 JPA Session 已关闭。访问未 fetch 的 lazy 属性 → **直接抛 `LazyInitializationException`**。

**这与踩坑记录 #7 是完全相同的模式**（JPA 懒加载导致 AI 服务报错），当时就是 `m.getSender().getNickname()` 报错才加的 `LEFT JOIN FETCH m.sender`。

**修复前置条件**: 必须先改 `findContextWindow` 查询:
```sql
SELECT m FROM Message m
  LEFT JOIN FETCH m.sender
  LEFT JOIN FETCH m.replyTo
WHERE m.group.id = :groupId AND m.createdAt >= :since
ORDER BY m.createdAt ASC LIMIT :limit
```

### Fix 3: @TransactionalEventListener -- OK，但有注意事项

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
```

**审查意见**: 正确修复。但需要注意：
1. `sendMessage()` 必须在 `@Transactional` 上下文中调用，否则 `AFTER_COMMIT` 事件永远不会触发（Spring 的设计：非事务环境中 `@TransactionalEventListener` 默认不执行）
2. 当前 `sendMessage()` 已有 `@Transactional`，没问题
3. 但 `sendAIMessage()` 也有 `@Transactional`，如果将来 AI 回复也要触发事件链，同样需要注意

### Fix 4: 添加调试日志 -- OK

无风险，直接执行。

---

## 四、文档遗漏的重大问题

### 遗漏 1: `triggerMessage` 参数从未被使用 (严重)

```java
// AIService.java:92
public List<Map<String, String>> buildContext(UUID groupId, Message triggerMessage) {
    // triggerMessage 参数在方法体中完全没有被引用
    // context 完全依赖 findContextWindow() 的数据库查询结果
}
```

**影响**: 即使 Fix 3 保证了事务提交后再查询，如果 trigger message 的 `createdAt` 恰好在 `since` 时间窗之外（极端情况），仍然会丢失。应该在查询结果末尾主动检查并补充 trigger message。

### 遗漏 2: `processMessage()` 自带 `@Async`，与 EventListener 的 `@Async` 双重叠加

```java
// MessageEventListener.java:17-18
@Async                    // ← 第一层 Async
@EventListener
public void handleMessageSent(MessageSentEvent event) {
    aiService.processMessage(event.getMessage());  // ← 调用下面的方法
}

// AIService.java:193
@Async                    // ← 第二层 Async
public void processMessage(Message message) { ... }
```

`aiService` 是 Spring 代理对象，`processMessage()` 的 `@Async` **会生效**。结果是：
1. EventListener 在线程池线程 A 执行
2. `processMessage()` 又被派发到线程池线程 B 执行
3. 线程 A 立即返回，做了一次无意义的线程切换

**应该去掉其中一个 `@Async`**。建议保留 EventListener 上的 `@Async`，去掉 `processMessage()` 上的。

### 遗漏 3: `extractUserMessage()` 擦除了 @AI 标记

```java
// AIService.java:132
content = displayName + ": " + extractUserMessage(content);
// extractUserMessage() 会把 "@AI" 从内容中删掉
```

AI 在 context 中看到的是：
```
TestUser: 你好        (原文: "@AI 你好")
TestUser: 帮我查一下   (原文: "@AI 帮我查一下")
TestUser: 今天天气     (原文: "今天天气" -- 普通消息)
```

三条消息看起来毫无区别。AI 无法知道哪些是直接提问、哪些是普通聊天。这加剧了根因 2 的问题。

**建议**: 保留 @AI 标记或替换为 `[提问A宝]` 这样的语义标签。

### 遗漏 4: RestTemplate 每次 new，无连接池无超时

```java
// AIService.java:233
RestTemplate restTemplate = new RestTemplate();
```

- 每次 API 调用都创建新的 RestTemplate，无法复用 HTTP 连接
- 没有配置任何超时，DeepSeek API 如果挂了，线程永远阻塞
- 应注入 Bean 并配置 `connectTimeout` + `readTimeout`

### 遗漏 5: `findContextWindow` 的 replyTo 可能指向上下文窗口外的消息

即使 Fix 2 加了回复标注，`msg.getReplyTo()` 指向的 AI 消息可能不在 30 分钟时间窗内（例如用户 2 小时后引用一条旧的 AI 回复追问）。此时 `replyTo.getContent()` 拿到的内容 AI 在 context 中从未见过，会造成困惑。

**建议**: 标注引用时，如果被引用消息不在 context 列表中，将其作为额外上下文插入到 context 开头。

---

## 五、修改文件清单（补充后）

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `MessageRepository.java` | `findContextWindow` 添加 `LEFT JOIN FETCH m.replyTo` | **P0 前置** |
| `AIService.java` - `buildSystemPrompt()` | Fix 1: 更新规则描述 | P0 |
| `AIService.java` - `buildContext()` | Fix 2: 标注 replyTo 关系 + 保留 @AI 标记 | P0 |
| `MessageEventListener.java` | Fix 3: `@TransactionalEventListener(AFTER_COMMIT)` | P0 |
| `AIService.java` - `processMessage()` | 去掉多余的 `@Async` | P1 |
| `AIService.java` - `processMessage()` | Fix 4: 添加 context 调试日志 | P1 |
| `AIService.java` - `buildContext()` | 兜底检查 triggerMessage 是否在查询结果中 | P1 |
| `AIService.java` - `callDeepSeekAPI()` | RestTemplate 改 Bean 注入 + 超时配置 | P2 |
| `AIServiceTest.java` | 补充 replyTo 标注、双 @Async 移除等测试 | P0 |

---

## 六、建议的执行顺序

```
1. [P0 前置] MessageRepository: findContextWindow 加 LEFT JOIN FETCH m.replyTo
2. [P0] Fix 3: @TransactionalEventListener -- 保证 trigger message 入库
3. [P0] Fix 1: 更新 System Prompt -- 对齐触发逻辑与 AI 指令
4. [P0] Fix 2: buildContext() 标注 replyTo + 保留 @AI 标记
5. [P1] 去掉 processMessage() 上多余的 @Async
6. [P1] Fix 4: 调试日志
7. [P1] triggerMessage 兜底检查
8. [P2] RestTemplate Bean + 超时
9. 全量测试: ./gradlew test + 手工双账号验证
```

---

## 七、结论

**文档的根因分析质量不错**，3 个根因定位准确，行号精确。但修复方案有一个**致命缺陷**（Fix 2 会触发 LazyInitializationException），以及**5 个遗漏问题**（双 @Async、@AI 标记被擦除、triggerMessage 未使用、RestTemplate 无超时、跨窗口 replyTo）。

建议按上述执行顺序修复，Fix 2 必须先改 Repository 查询才能落地。
