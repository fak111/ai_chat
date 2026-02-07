---
title: A宝群聊 AI 对话系统 — 终极优化方案
version: v1.0
created: 2026-02-07
updated: 2026-02-07
author: zfc
---

# A宝群聊 AI 对话系统 — 终极优化方案

> 本文档整合 `ai.md`（根因分析）、`ai-review.md`（代码审查）、`ai-deep-audit.md`（深度审视）、`chat-ai-optimization-plan.md`（优化计划）四份文档的精华，结合实际代码静态分析，输出一份**可直接执行**的完整技术方案。

---

## 1. 问题全景

### 1.1 现象汇总

基于实际群聊测试数据，A宝存在以下核心问题：

| # | 类型 | 典型场景 | 表现 |
|---|------|----------|------|
| 1 | 重复回复 | 连续追问 3 次 | AI 返回字符级完全一致的回复 |
| 2 | 答非所问 | 用户回答 "体育 比如 c罗" | AI 仍说 "需要知道具体是哪个领域" |
| 3 | 格式混乱 | 问 "A宝是什么" | AI 输出 `TestUser: 你是什么？\nTest2: 你是AI吗？` |
| 4 | 无记忆 | 连续 3 次问 AI 身份 | 每次重新自我介绍 |
| 5 | 不理解追问 | 引用 AI 消息追问（不含 @AI） | 给出与触发无关的回答 |

### 1.2 根因拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                      用户发送消息                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ MessageService      │
              │ .sendMessage()      │─── @Transactional ───┐
              │                     │                      │
              │ eventPublisher      │                      │
              │ .publishEvent()  ◄──┼── 根因 C：事务未提交  │
              └─────────┬───────────┘                      │
                        │                                  │
          ┌─────────────▼────────────────┐                 │
          │ MessageEventListener         │                 │
          │ @Async @EventListener    ◄───┼── 根因 D：      │
          │                              │   双重 @Async   │
          │ aiService.processMessage()   │                 │
          └─────────────┬────────────────┘                 │
                        │                                  │
          ┌─────────────▼────────────────┐                 │
          │ AIService.processMessage()   │                 │
          │ @Async                       │                 │
          └─────────────┬────────────────┘                 │
                        │                                  │
          ┌─────────────▼────────────────┐                 │
          │ buildContext()               │                 │
          │                              │                 │
          │ findContextWindow() ─────────┼── 根因 C：      │
          │ triggerMessage 未使用 ◄───────┼── 根因 E：      │
          │                              │   trigger 可能  │
          │ replyTo 未 FETCH ◄───────────┼── 根因 F：      │
          │                              │   Lazy 异常     │
          │ @AI 被擦除 ◄────────────────┼── 根因 B：      │
          │                              │   语义丢失      │
          └─────────────┬────────────────┘                 │
                        │                                  │
          ┌─────────────▼────────────────┐                 │
          │ buildSystemPrompt()          │                 │
          │                              │                 │
          │ "只回复 @AI 消息" ◄──────────┼── 根因 A：      │
          │   vs 实际支持引用追问         │   规则矛盾      │
          └─────────────┬────────────────┘                 │
                        │                                  │
          ┌─────────────▼────────────────┐                 │
          │ callDeepSeekAPI()            │                 │
          │                              │                 │
          │ new RestTemplate() ◄─────────┼── 根因 G：      │
          │ 无超时 / 无连接池            │   HTTP 韧性不足 │
          └──────────────────────────────┘                 │
                                                           │
                  事务提交 ◄───────────────────────────────┘
```

### 1.3 七大根因详解

| 根因 | 代码位置 | 严重度 | 影响 |
|------|----------|--------|------|
| **A. Prompt 规则与触发逻辑矛盾** | `AIService.java:164` vs `:71-87` | P0 | AI 收到引用追问但 prompt 说"只回复 @AI"，行为不可预测 |
| **B. `@AI` 标记被 `extractUserMessage()` 擦除** | `AIService.java:63,132` | P0 | AI 无法区分"直接提问"和"普通发言" |
| **C. 事件在事务提交前触发** | `MessageEventListener.java:17-18` | P0 | trigger 消息可能不在 context 中，导致重复回复 |
| **D. 双重 `@Async` 叠加** | `MessageEventListener.java:17` + `AIService.java:193` | P1 | 无意义线程切换，增加时序不确定性 |
| **E. `triggerMessage` 参数未使用** | `AIService.java:92` | P1 | 即使事务已提交，极端情况 trigger 可能不在时间窗内 |
| **F. `replyTo` 未 eager fetch** | `MessageRepository.java:24-25` | P0 | 访问 `msg.getReplyTo()` 会触发 `LazyInitializationException` |
| **G. RestTemplate 无连接池无超时** | `AIService.java:233` | P2 | DeepSeek 异常时线程永久阻塞 |

---

## 2. 解决方案总览

```
┌──────────────────────────────────────────────────────────────┐
│                     修复层级全景                               │
├──────────────┬───────────────────────────────────────────────┤
│ 层级         │ 修复项                                         │
├──────────────┼───────────────────────────────────────────────┤
│ 数据层       │ S1. 查询补全 replyTo eager fetch              │
│              │ S2. triggerMessage 兜底校验                    │
├──────────────┼───────────────────────────────────────────────┤
│ 事件层       │ S3. @TransactionalEventListener(AFTER_COMMIT) │
│              │ S4. 合并双重 @Async                           │
├──────────────┼───────────────────────────────────────────────┤
│ 上下文层     │ S5. replyTo 引用关系标注                      │
│              │ S6. @AI 触发语义保留                          │
│              │ S7. 跨窗口 replyTo 补偿                       │
├──────────────┼───────────────────────────────────────────────┤
│ Prompt 层    │ S8. System Prompt 规则重写                    │
├──────────────┼───────────────────────────────────────────────┤
│ HTTP 层      │ S9. RestTemplate Bean 化 + 超时               │
├──────────────┼───────────────────────────────────────────────┤
│ 可观测性     │ S10. 结构化调试日志                           │
└──────────────┴───────────────────────────────────────────────┘
```

---

## 3. 详细方案

### S1. 查询补全 replyTo eager fetch [P0 前置]

**根因**: F
**文件**: `server/src/main/java/com/abao/repository/MessageRepository.java`

`findContextWindow` 查询当前只 fetch 了 `sender`，没有 fetch `replyTo`。在 `@Async` 线程中访问 lazy 的 `replyTo` 会抛 `LazyInitializationException`（与踩坑记录 #7 同源）。

**改动**:

```java
// Before
@Query("SELECT m FROM Message m LEFT JOIN FETCH m.sender "
     + "WHERE m.group.id = :groupId AND m.createdAt >= :since "
     + "ORDER BY m.createdAt ASC LIMIT :limit")
List<Message> findContextWindow(...);

// After
@Query("SELECT m FROM Message m "
     + "LEFT JOIN FETCH m.sender "
     + "LEFT JOIN FETCH m.replyTo "
     + "WHERE m.group.id = :groupId AND m.createdAt >= :since "
     + "ORDER BY m.createdAt ASC LIMIT :limit")
List<Message> findContextWindow(...);
```

**说明**: 加 `LEFT JOIN FETCH m.replyTo` 使得 replyTo 在查询时一次性加载，后续在 `buildContext()` 中可以安全访问。JOIN FETCH 只增加一次 SQL JOIN，对性能影响可忽略（消息表有 `(group_id, created_at)` 索引）。

---

### S2. triggerMessage 兜底校验 [P1]

**根因**: E
**文件**: `server/src/main/java/com/abao/service/AIService.java` — `buildContext()`

当前 `triggerMessage` 参数传入但从未使用。极端情况下（消息 `createdAt` 恰好在时间窗边界之外），触发消息可能不在 `findContextWindow()` 的返回结果中。

**改动**: 在 `buildContext()` 查询结果末尾检查并补充 trigger message。

```java
public List<Map<String, String>> buildContext(UUID groupId, Message triggerMessage) {
    // ... existing query ...
    List<Message> recentMessages = messageRepository.findContextWindow(groupId, since, contextMaxMessages);

    // S2: 兜底校验 — 确保 triggerMessage 在 context 中
    boolean triggerPresent = recentMessages.stream()
        .anyMatch(m -> m.getId().equals(triggerMessage.getId()));
    if (!triggerPresent) {
        recentMessages = new ArrayList<>(recentMessages);
        recentMessages.add(triggerMessage);
    }

    // ... rest of method ...
}
```

---

### S3. @TransactionalEventListener(AFTER_COMMIT) [P0]

**根因**: C
**文件**: `server/src/main/java/com/abao/event/MessageEventListener.java`

当前使用 `@EventListener`，事件在事务内发布、异步线程执行。新线程查询时，原事务可能尚未提交，导致 trigger message 不在查询结果中。

**改动**:

```java
// Before
@Async
@EventListener
public void handleMessageSent(MessageSentEvent event) {

// After
@Async
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void handleMessageSent(MessageSentEvent event) {
```

**注意事项**:
- `sendMessage()` 已有 `@Transactional`，`AFTER_COMMIT` 可正常工作
- 若 `sendMessage()` 未在事务中调用，`@TransactionalEventListener` 默认**不会触发**（Spring 设计如此）。当前代码无此风险，但需注意未来改动
- 需新增 import: `org.springframework.transaction.event.TransactionalEventListener` 和 `TransactionPhase`

---

### S4. 合并双重 @Async [P1]

**根因**: D
**文件**: `MessageEventListener.java:17` + `AIService.java:193`

`MessageEventListener.handleMessageSent()` 标注了 `@Async`，它调用的 `AIService.processMessage()` 也标注了 `@Async`。由于 `aiService` 是 Spring 代理对象，第二个 `@Async` 会生效，导致任务被提交到线程池两次（线程 A → 提交到线程池 → 线程 B 执行），线程 A 做了一次无意义的线程切换。

**改动**: 去掉 `AIService.processMessage()` 上的 `@Async`，保留 `MessageEventListener` 上的。

```java
// AIService.java
// Before
@Async
public void processMessage(Message message) {

// After
public void processMessage(Message message) {
```

**理由**: 异步入口应在事件消费端（Listener），而非业务方法。这样 `processMessage()` 作为普通同步方法也可以被其他地方直接调用和测试。

---

### S5. replyTo 引用关系标注 [P0]

**根因**: A + 原始根因 2
**文件**: `server/src/main/java/com/abao/service/AIService.java` — `buildContext()`

当前 `buildContext()` 对所有用户消息统一拼接为 `昵称: 内容`，AI 无法分辨哪些消息是对自己的追问。

**改动**: 当用户消息的 `replyTo` 指向 AI 消息时，在 content 中加入引用标注。

```java
case USER -> {
    role = "user";
    String displayName = msg.getSender() != null
        ? msg.getSender().getNickname()
        : "Unknown";

    // S5: 标注引用关系
    if (msg.getReplyTo() != null
        && msg.getReplyTo().getMessageType() == MessageType.AI) {
        String quoted = msg.getReplyTo().getContent();
        if (quoted != null && quoted.length() > 50) {
            quoted = quoted.substring(0, 50) + "...";
        }
        content = displayName + " [回复A宝: \"" + quoted + "\"]: "
                + extractUserMessage(content);
    } else {
        content = displayName + ": " + extractUserMessage(content);
    }
}
```

**效果**: AI 看到的 context 变为：

```
user: TestUser: @AI 去查吧
assistant: 好的！不过我需要知道具体是哪个领域...
user: Test2 [回复A宝: "好的！不过我需要知道具体是哪个领域..."]: 体育 比如 c罗
```

AI 立刻理解这是对自己问题的回答。

**前置依赖**: S1（replyTo eager fetch）必须先完成，否则访问 `msg.getReplyTo()` 触发 `LazyInitializationException`。

---

### S6. @AI 触发语义保留 [P0]

**根因**: B
**文件**: `server/src/main/java/com/abao/service/AIService.java` — `buildContext()`

当前 `extractUserMessage()` 将 `@AI` 从内容中完全删除。AI 在 context 中看到：

```
user: TestUser: 你好          (原文: "@AI 你好")
user: TestUser: 帮我查一下     (原文: "@AI 帮我查一下")
user: TestUser: 今天天气       (原文: "今天天气" — 普通消息)
```

三条消息看起来毫无区别，AI 无法区分"直接提问"和"普通聊天"。

**改动**: 将 `@AI` 替换为语义标签 `[提问A宝]` 而非直接删除。

```java
// Before
public String extractUserMessage(String content) {
    if (content == null) return "";
    return AI_MENTION_PATTERN.matcher(content).replaceAll("").trim();
}

// After
public String extractUserMessage(String content) {
    if (content == null) return "";
    return AI_MENTION_PATTERN.matcher(content).replaceAll("[提问A宝]").trim();
}
```

**效果**:

```
user: TestUser: [提问A宝] 你好          ← 明确在叫 AI
user: TestUser: 帮我查一下               ← 普通聊天
```

---

### S7. 跨窗口 replyTo 补偿 [P1]

**根因**: 审视报告遗漏 5
**文件**: `server/src/main/java/com/abao/service/AIService.java` — `buildContext()`

用户可能在 2 小时后引用一条旧的 AI 回复进行追问。此时 `replyTo` 指向的消息不在 30 分钟时间窗内，AI 在 context 中从未见过被引用的内容，会造成困惑。

**改动**: 当被引用消息不在当前 context 列表中时，将其作为额外上下文插入到对话历史开头。

```java
// 在构建 conversation history 之前
Set<UUID> contextMessageIds = recentMessages.stream()
    .map(Message::getId)
    .collect(Collectors.toSet());

// 收集需要补偿的 replyTo 消息
List<Message> replyCompensations = new ArrayList<>();
for (Message msg : recentMessages) {
    if (msg.getReplyTo() != null
        && msg.getReplyTo().getMessageType() == MessageType.AI
        && !contextMessageIds.contains(msg.getReplyTo().getId())) {
        replyCompensations.add(msg.getReplyTo());
        contextMessageIds.add(msg.getReplyTo().getId()); // 避免重复补偿
    }
}

// 如果有补偿消息，在 system prompt 后、正常对话前插入
if (!replyCompensations.isEmpty()) {
    messages.add(Map.of("role", "system",
        "content", "[以下是被引用的历史消息，用于理解追问上下文]"));
    for (Message comp : replyCompensations) {
        messages.add(Map.of("role", "assistant", "content", comp.getContent()));
    }
    messages.add(Map.of("role", "system",
        "content", "[以下是最近的对话记录]"));
}
```

**注意**: 补偿消息的 `content` 直接从 `replyTo` 获取（S1 已 eager fetch），无需额外数据库查询。

---

### S8. System Prompt 规则重写 [P0]

**根因**: A
**文件**: `server/src/main/java/com/abao/service/AIService.java` — `buildSystemPrompt()`

当前 prompt 写 "只回复 @AI 的消息"，但 `shouldTriggerAI()` 同时支持引用追问触发。二者矛盾导致 AI 行为不可预测。

**改动**: 重写完整 system prompt。

```java
private String buildSystemPrompt(Set<String> activeMembers) {
    String memberList = activeMembers.isEmpty()
        ? "暂无"
        : String.join("、", activeMembers);

    return """
        你是"A宝"，一个群聊 AI 助手。

        ## 群聊信息
        - 当前群内活跃成员: %s

        ## 你的人设
        - 名字叫 A宝
        - 风格：友好、简洁、有趣
        - 用口语化中文回复
        - 回复长度控制在 1-3 句话，除非用户要求详细解答

        ## 触发规则
        你会在以下两种情况被触发回复：
        1. 用户消息中包含 [提问A宝] 标记 — 这是用户直接向你提问
        2. 用户引用你之前的回复进行追问 — 消息中会有 [回复A宝: "..."] 标记

        无论哪种情况，都要重点理解最后一条用户消息的意图，并结合上下文给出回答。

        ## 回复规范
        - 严禁重复你之前已经回复过的内容
        - 直接回复内容，不要以任何人的名字开头
        - 不要模拟其他用户说话
        - 不要输出 "用户名: 内容" 这种格式
        - 你的回复就是你自己说的话，不需要角色标注
        - 如果不确定答案，诚实地说不知道
        - 如果用户问"群里有谁"，根据活跃成员列表回答
        """.formatted(memberList);
}
```

**关键变化**:
- "只回复 @AI 消息" → 明确列出两种触发情况
- 与 S5（`[回复A宝]` 标记）和 S6（`[提问A宝]` 标记）语义对齐
- 新增 "重点理解最后一条用户消息的意图"，引导 AI 关注追问
- 新增 "严禁重复" 规则，解决重复回复问题

---

### S9. RestTemplate Bean 化 + 超时 [P2]

**根因**: G
**文件**: `server/src/main/java/com/abao/service/AIService.java` + 新增配置类

当前每次 API 调用都 `new RestTemplate()`，无法复用 HTTP 连接，且无超时配置。如果 DeepSeek API 挂了，线程将永久阻塞。

**改动 1**: 新增 `RestTemplateConfig.java`

```java
@Configuration
public class RestTemplateConfig {

    @Bean("aiRestTemplate")
    public RestTemplate aiRestTemplate(
            @Value("${ai.deepseek.timeout:30000}") int timeout) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(5000));  // 连接超时 5s
        factory.setReadTimeout(Duration.ofMillis(timeout));  // 读取超时 30s
        return new RestTemplate(factory);
    }
}
```

**改动 2**: `AIService.java` 注入 Bean

```java
// Before
private String callDeepSeekAPI(List<Map<String, String>> messages) {
    RestTemplate restTemplate = new RestTemplate();
    // ...
}

// After
@Qualifier("aiRestTemplate")
private final RestTemplate restTemplate;  // 通过构造函数注入

private String callDeepSeekAPI(List<Map<String, String>> messages) {
    // 直接使用 this.restTemplate
    // ...
}
```

---

### S10. 结构化调试日志 [P1]

**文件**: `server/src/main/java/com/abao/service/AIService.java` — `processMessage()`

**改动**: 在 `callDeepSeekAPI()` 前添加结构化日志。

```java
public void processMessage(Message message) {
    // ...
    List<Map<String, String>> context = buildContext(groupId, message);

    // S10: 结构化调试日志
    log.info("AI context: groupId={}, triggerMsgId={}, replyToId={}, contextSize={}, trigger='{}'",
        groupId,
        message.getId(),
        message.getReplyTo() != null ? message.getReplyTo().getId() : "null",
        context.size(),
        message.getContent().length() > 100
            ? message.getContent().substring(0, 100) + "..."
            : message.getContent());

    if (log.isDebugEnabled()) {
        log.debug("Full AI context: {}", context);
    }

    String aiResponse = callDeepSeekAPI(context);
    // ...
}
```

---

## 4. 修改文件清单

```
┌─────────────────────────────────────────────────┬──────────────────────────┬──────┐
│ 文件                                             │ 改动                      │ 优先 │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ MessageRepository.java                           │ S1: +LEFT JOIN FETCH     │ P0   │
│                                                  │     m.replyTo            │      │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ MessageEventListener.java                        │ S3: @TransactionalEvent  │ P0   │
│                                                  │     Listener(AFTER_COMMIT│      │
│                                                  │     )                    │      │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ AIService.java - buildSystemPrompt()             │ S8: 重写 system prompt   │ P0   │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ AIService.java - buildContext()                  │ S5: replyTo 标注         │ P0   │
│                                                  │ S6: @AI 语义保留         │      │
│                                                  │ S7: 跨窗口补偿           │      │
│                                                  │ S2: trigger 兜底         │      │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ AIService.java - extractUserMessage()            │ S6: replaceAll →         │ P0   │
│                                                  │     [提问A宝]            │      │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ AIService.java - processMessage()                │ S4: 去掉 @Async          │ P1   │
│                                                  │ S10: 结构化日志          │      │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ AIService.java - callDeepSeekAPI()               │ S9: 注入 RestTemplate    │ P2   │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ RestTemplateConfig.java (新增)                   │ S9: Bean + 超时配置      │ P2   │
├─────────────────────────────────────────────────┼──────────────────────────┼──────┤
│ AIServiceTest.java                               │ 补充 S5/S6/S2 的单元测试 │ P0   │
└─────────────────────────────────────────────────┴──────────────────────────┴──────┘
```

---

## 5. 执行顺序

严格按依赖关系排列，不可跳步：

```
Phase 1: 数据层修复（保证后续改动可落地）
──────────────────────────────────────────
Step 1  S1  MessageRepository: findContextWindow 加 LEFT JOIN FETCH m.replyTo
            └── 必须首先完成，S5/S7 依赖它

Phase 2: 事件层修复（保证 context 完整性）
──────────────────────────────────────────
Step 2  S3  MessageEventListener: @TransactionalEventListener(AFTER_COMMIT)
            └── 保证 trigger message 已入库再查询

Step 3  S4  AIService.processMessage(): 去掉 @Async
            └── 消除双重异步，降低时序风险

Phase 3: 上下文层修复（保证 AI 理解对话）
──────────────────────────────────────────
Step 4  S6  AIService.extractUserMessage(): @AI → [提问A宝]
            └── 保留触发语义

Step 5  S5  AIService.buildContext(): replyTo 引用标注
            └── 让 AI 知道哪些消息是追问

Step 6  S2  AIService.buildContext(): triggerMessage 兜底
            └── 确保 trigger 永远在 context 中

Step 7  S7  AIService.buildContext(): 跨窗口 replyTo 补偿
            └── 处理引用旧消息的场景

Phase 4: Prompt 层修复（对齐 AI 指令）
──────────────────────────────────────────
Step 8  S8  AIService.buildSystemPrompt(): 规则重写
            └── 与 S5/S6 的标记语义对齐

Phase 5: 可观测性 + 稳定性
──────────────────────────────────────────
Step 9  S10 AIService.processMessage(): 结构化日志
Step 10 S9  RestTemplate Bean + 超时配置

Phase 6: 测试验证
──────────────────────────────────────────
Step 11     AIServiceTest: 补充测试用例（见第 6 节）
Step 12     后端全量测试: cd server && ./gradlew test
Step 13     手工验证: 双账号对话测试（见第 7 节）
```

---

## 6. 测试用例补充

### 6.1 需要新增的单元测试

```
AIServiceTest
├── ReplyToAnnotationTests (S5)
│   ├── buildContext_UserReplyToAI_ContentContainsQuoteAnnotation
│   │   验证: 引用 AI 消息的用户消息，content 包含 [回复A宝: "..."]
│   ├── buildContext_UserReplyToUser_NoQuoteAnnotation
│   │   验证: 引用普通用户消息时，不添加标注
│   └── buildContext_ReplyToContent_TruncatedAt50Chars
│       验证: 被引用内容超 50 字时截断并加 "..."
│
├── TriggerSemanticTests (S6)
│   ├── extractUserMessage_ReplacesAtAI_WithSemanticTag
│   │   验证: "@AI 你好" → "[提问A宝] 你好"
│   └── buildContext_PreservesAtAISemantics_InContent
│       验证: context 中用户消息保留 [提问A宝] 标记
│
├── TriggerMessageGuaranteeTests (S2)
│   ├── buildContext_TriggerNotInQuery_AppendsToEnd
│   │   验证: trigger 不在查询结果中时，自动追加
│   └── buildContext_TriggerInQuery_NoDuplicate
│       验证: trigger 已在查询结果中时，不重复追加
│
├── CrossWindowReplyTests (S7)
│   ├── buildContext_ReplyToOutsideWindow_InsertsCompensation
│   │   验证: 被引用 AI 消息不在 context 中时，补偿插入
│   └── buildContext_ReplyToInsideWindow_NoCompensation
│       验证: 被引用 AI 消息已在 context 中时，不额外插入
│
└── SystemPromptTests (S8)
    ├── buildContext_SystemPrompt_MentionsTwoTriggerTypes
    │   验证: prompt 包含 "[提问A宝]" 和 "[回复A宝]" 两种触发说明
    └── buildContext_SystemPrompt_ForbidsRepetition
        验证: prompt 包含 "严禁重复" 规则
```

### 6.2 需要修改的现有测试

| 测试 | 修改原因 |
|------|----------|
| `extractUserMessage_RemovesAtAIMention` | `@AI` 不再被删除而是替换为 `[提问A宝]`，断言需更新 |
| `buildContext_UserMessages_IncludeSenderNameInContent` | content 格式可能因 S5/S6 而变化 |

---

## 7. 验证方案

### 7.1 自动化验证

```bash
# 1. 后端单元测试
cd server && ./gradlew test

# 2. API 集成测试
cd server/scripts && ./api_test.sh
```

### 7.2 手工验证矩阵

| # | 场景 | 操作 | 预期结果 |
|---|------|------|----------|
| 1 | @AI 直接提问 | UserA: "@AI 今天天气怎么样" | AI 正常回复天气相关内容 |
| 2 | 引用追问（不含 @AI） | UserA 引用 AI 回复，输入 "北京的呢" | AI 理解这是对天气回复的追问，回答北京天气 |
| 3 | 连续追问不重复 | 连续 @AI 3 次 "你是谁" | AI 第 2/3 次不再重新自我介绍 |
| 4 | 格式正确 | "@AI A宝是什么" | AI 不输出 `用户名: 内容` 格式 |
| 5 | 群成员感知 | "@AI 群里有谁" | AI 列出最近活跃成员名字 |
| 6 | 跨时间追问 | 2 小时后引用旧 AI 消息追问 | AI 能理解被引用的内容（补偿机制） |
| 7 | 普通消息不触发 | UserA: "今天天气真好"（不含 @AI） | AI 不回复 |

### 7.3 日志验证

```bash
# 查看 AI context 日志
docker logs abao-server 2>&1 | grep "AI context"

# 预期输出示例:
# AI context: groupId=xxx, triggerMsgId=yyy, replyToId=zzz, contextSize=5, trigger='[提问A宝] 你好'
```

---

## 8. 架构演进路线

本方案解决的是 MVP 阶段的对话质量问题。长期来看，以下方向值得考虑：

```
                        当前方案 (MVP)
                             │
                 ┌───────────┼───────────┐
                 ▼           ▼           ▼
          Phase 2        Phase 3       Phase 4
      ┌──────────┐  ┌───────────┐  ┌──────────┐
      │ 长期记忆  │  │ 主动参与   │  │ 多模态    │
      │          │  │           │  │          │
      │ 群级摘要  │  │ 讨论检测   │  │ 图片理解  │
      │ 用户画像  │  │ 氛围感知   │  │ 语音转文  │
      │ 话题追踪  │  │ 可配开关   │  │ 文件分析  │
      └──────────┘  └───────────┘  └──────────┘
```

| 方向 | 说明 | 前置条件 |
|------|------|----------|
| **长期记忆** | 超出 30 分钟窗口的对话压缩为摘要，注入 system prompt | 本方案 S8 完成 |
| **主动参与** | 检测群内热烈讨论时 AI 主动插话（可配开关） | 需要消息频率统计 |
| **多模态** | 用户发图 @AI，支持图片理解 | DeepSeek Vision API |
| **情绪感知** | 根据群内氛围自动调整回复风格 | 需要情感分析模型 |
| **Streaming 回复** | AI 回复通过 WebSocket 逐字推送 | SSE 或 WebSocket 扩展 |

---

## 9. 风险评估

| 风险 | 影响 | 缓解措施 | 状态 |
|------|------|----------|------|
| S1 JOIN FETCH 导致笛卡尔积 | 极低：replyTo 是 ManyToOne，最多 1 条 | 无需额外处理 | 可控 |
| S3 非事务调用不触发事件 | 中：未来重构可能改变调用链 | 代码注释 + 单元测试守护 | 可控 |
| S6 `[提问A宝]` 侵入用户内容 | 低：仅在 AI context 中替换 | 不影响 DB 存储和前端展示 | 可控 |
| S7 补偿消息膨胀 context | 低：最多补偿几条被引用消息 | 限制补偿数量上限（如 5 条） | 可控 |
| Token 消耗增加 | 中：补偿消息 + 更长 prompt | 监控 token 用量，必要时缩窗口 | 需监控 |

---

## 10. 参考资料

| 文档 | 说明 |
|------|------|
| `doc/chat/ai.md` | 原始根因分析（3 个根因 + 4 个 Fix） |
| `doc/chat/ai-review.md` | 代码审查报告（发现 Fix 2 致命缺陷 + 5 个遗漏） |
| `doc/chat/ai-deep-audit.md` | 深度审视报告（核验根因 + 可落地性评估） |
| `doc/chat/chat-ai-optimization-plan.md` | 优化计划（上下文窗口 + 引用按钮 + 远期规划） |
| CLAUDE.md 踩坑记录 #7 | JPA 懒加载 `LazyInitializationException` 同源问题 |
