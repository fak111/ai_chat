# AI 对话问题文档（ai.md）深度审视报告

> 审视对象：`doc/chat/ai.md`
> 审视日期：2026-02-06
> 审视方式：逐条对照后端/前端代码与现有测试材料

## 1. 审视范围与证据

本次审视覆盖以下关键链路：
- 文档：`doc/chat/ai.md`
- 后端触发与上下文：`server/src/main/java/com/abao/service/AIService.java`
- 事务事件：`server/src/main/java/com/abao/event/MessageEventListener.java`、`server/src/main/java/com/abao/service/MessageService.java`
- 上下文查询：`server/src/main/java/com/abao/repository/MessageRepository.java`
- 前端引用追问链路：`app/lib/screens/chat/chat_screen.dart`、`app/lib/providers/chat_provider.dart`
- 历史验证记录：`doc/e2e/e2e_2/e2e.md`

> 说明：当前环境缺少 Java 运行时，无法在本机复跑 `./gradlew test`，以下“是否成立”结论来自静态代码审查与文档证据比对。

## 2. 对 ai.md 三个根因的核验

### 根因 1：Prompt 与触发条件矛盾（成立）
- `AIService.shouldTriggerAI()` 同时支持两种触发：`@AI` 与“回复 AI 消息”（`AIService.java:71`）。
- 但系统提示词写的是“只回复 @AI 消息”（`AIService.java:164`）。
- 结论：**矛盾真实存在**，会导致模型在“引用 AI 但不带 @AI”场景中的行为不稳定。

### 根因 2：上下文未标注“这是追问谁”（成立）
- `buildContext()` 对 USER 消息统一拼接为 `昵称: 内容`（`AIService.java:118` 起），未显式利用 `replyTo` 关系。
- `triggerMessage` 参数传入但未使用（`AIService.java:92`）。
- 结论：**成立**，模型无法稳定区分普通发言与对 AI 的追问。

### 根因 3：事件可能先于事务提交执行（成立）
- 事件在事务方法内发布（`MessageService.java:67`）。
- 监听器是 `@Async + @EventListener`（`MessageEventListener.java:17`），在异步线程读取上下文。
- 结论：**成立**，存在“触发消息尚未可见，导致上下文缺失”的时序风险。

## 3. 对 ai.md 四个修复项的可落地性评估

### Fix 1（改 Prompt）
可直接做，优先级 P0。应明确两类触发都需要回复，避免“只回复 @AI”这类硬冲突描述。

### Fix 2（在 context 标注 reply 关系）
方向正确，但需补两个前置约束：
1. 若直接读取 `msg.getReplyTo()`，建议同步调整查询，避免懒加载风险（可在 `findContextWindow` 中显式处理 `replyTo` 读取策略）。
2. 引用内容需做长度、引号与换行清洗，防止 prompt 污染与噪声膨胀。

### Fix 3（`@TransactionalEventListener(AFTER_COMMIT)`）
正确且必要，优先级 P0。可显著降低“上下文缺触发消息”的时序问题。

### Fix 4（context 调试日志）
建议保留，但应记录结构化字段：`groupId`、`triggerMessageId`、`replyToId`、`contextSize`，便于后续定位重复回复问题。

## 4. ai.md 漏掉的关键问题

1. **文档形态不合格**：`doc/chat/ai.md` 末尾仍有对话残留（`Claude has written...`，`ai.md:149`），且非标准 Markdown 标题结构。
2. **双重异步调度**：监听器与 `AIService.processMessage()` 都带 `@Async`（`MessageEventListener.java:17`、`AIService.java:193`），会增加线程切换和时序复杂度。
3. **触发语义被弱化**：`extractUserMessage()` 会移除 `@AI`（`AIService.java:63`），导致上下文里“直接召唤 AI”和“普通聊天”更难区分。
4. **HTTP 客户端韧性不足**：`callDeepSeekAPI()` 每次 `new RestTemplate`（`AIService.java:233`），且配置里存在 `timeout` 但代码未体现超时注入。
5. **验证覆盖不够精准**：`doc/e2e/e2e_2/e2e.md` 的追问样例主要是“引用 + @AI”，尚未覆盖“仅引用 AI、不带 @AI”的关键回归场景。

## 5. 建议执行顺序（按风险）

### P0（先做）
1. 修正 Prompt 触发规则（Fix 1）。
2. 监听改为 AFTER_COMMIT（Fix 3）。
3. `buildContext()` 增加 reply 关系标注（Fix 2），并补充安全清洗。

### P1（紧随其后）
1. 合并异步入口（保留一处 `@Async` 即可）。
2. 保留触发语义（例如将 `@AI` 替换为 `[召唤A宝]`，而不是完全删除）。
3. 增加结构化上下文日志（Fix 4 增强版）。

### P2（稳定性增强）
1. 改造 DeepSeek HTTP 客户端为可复用 Bean，明确连接/读取超时。
2. 增补自动化测试：
   - “引用 AI 但不带 @AI”应触发并正确理解追问；
   - 事务提交后再处理事件；
   - 上下文中明确体现 reply 关联信息。

## 6. 最终判断

`ai.md` 的核心方向是对的，三个根因并非“拍脑袋”，而是能在代码里找到对应依据；但当前文档仍属于“可讨论方案”，还不是“可直接执行清单”。

**关键结论：先修时序一致性（AFTER_COMMIT）与触发语义一致性（Prompt），再做 context 关系建模，否则“重复回复/答非所问”会反复出现。**
