
 AI 对话质量问题分析与修复                                                                                     

 Context

 双账号测试登录成功后，实际对话测试发现 AI 回复质量严重有问题：
 - AI 给出完全相同的回复（字符级一致）
 - AI 不理解用户的追问内容（如用户回答"体育 比如 c罗"，AI 仍说"需要知道具体是哪个领域"）
 - AI 对与对话主题无关的问题也给出之前话题的回复

 根因分析

 通过分析 AIService.java 代码和对话数据，定位到 3 个根因：

 根因 1：System Prompt 与触发逻辑矛盾（最关键）

 代码位置: AIService.java:164
 规则: "只回复 @AI 的消息，但要参考上下文理解语境"

 问题: 系统告诉 AI "只回复 @AI 消息"，但实际上用户引用 AI 消息追问（不含 @AI）也会触发 AI。AI 收到 "体育 比如 c罗" 这条不含 @AI 的消息时，系统让它回复，但 prompt 又说不该回复非 @AI 消息 → AI 困惑 →
 给出重复/generic 回复。

 根因 2：AI 不知道该回复哪条消息

 代码位置: AIService.java:118-140

 buildContext() 构建的是一个扁平时间线，没有标注"当前需要回复的是哪条消息"。在多人群聊中，AI 看到一堆消息，不知道最后一条是追问自己的。

 例如用户 "体育 比如 c罗" 是对 AI "需要知道具体是哪个领域" 的追问，但 context 里只是按时间排列：
 User: "Test2: 去查吧"
 Assistant: "好的！不过我需要知道具体是哪个领域..."
 User: "Test2: 体育 比如 c罗"    ← AI 不知道这是在回答它的问题

 根因 3：事件监听可能在事务提交前执行

 代码位置: MessageEventListener.java:17-22

 @Async
 @EventListener    // ← 问题：事务内发布事件，async handler 可能在事务 commit 前执行
 public void handleMessageSent(MessageSentEvent event) {

 sendMessage() 在 @Transactional 内发布事件，@Async handler 在另一个线程执行。如果 async 线程先于事务提交执行
 findContextWindow()，当前消息不在查询结果中。虽然概率低（毫秒级差异），但在高并发时可能发生。

 修复方案

 Fix 1：更新 System Prompt（后端）

 文件: server/src/main/java/com/abao/service/AIService.java 的 buildSystemPrompt() (line 148-175)

 修改规则部分：
 ## 规则
 - 回复 @AI 的消息以及用户对你消息的追问回复
 - 参考上下文理解语境，特别关注最后一条用户消息
 - 如果用户问"群里有谁"，根据最近消息中的成员列表回答
 - 不要重复之前已经说过的内容
 - 如果不确定答案，诚实地说不知道

 Fix 2：在 context 中标注回复关系（后端）

 文件: server/src/main/java/com/abao/service/AIService.java 的 buildContext() (line 118-140)

 当用户消息有 replyTo 且 replyTo 是 AI 消息时，在 content 前加上引用标注：
 // 在 case USER 分支中：
 if (msg.getReplyTo() != null && msg.getReplyTo().getMessageType() == MessageType.AI) {
     String quoted = msg.getReplyTo().getContent();
     if (quoted.length() > 50) quoted = quoted.substring(0, 50) + "...";
     content = displayName + " (回复A宝: \"" + quoted + "\"): " + extractUserMessage(content);
 } else {
     content = displayName + ": " + extractUserMessage(content);
 }

 这样 AI 看到的 context 变成：
 Assistant: "好的！不过我需要知道具体是哪个领域..."
 User: "Test2 (回复A宝: "好的！不过我需要知道具体是哪个领域..."): 体育 比如 c罗"
 AI 立刻明白这是对自己问题的回答。

 Fix 3：改用 @TransactionalEventListener 保证事务提交后执行

 文件: server/src/main/java/com/abao/event/MessageEventListener.java (line 17-22)

 @Async
 @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)  // 替代 @EventListener
 public void handleMessageSent(MessageSentEvent event) {

 确保 buildContext() 查询时，触发消息已经 committed 到数据库。

 Fix 4：添加 context 调试日志

 文件: server/src/main/java/com/abao/service/AIService.java 的 processMessage() (line 193-221)

 在 callDeepSeekAPI() 前加日志：
 log.info("AI context for groupId={}: {} messages, trigger='{}'",
     groupId, context.size(), message.getContent());
 if (log.isDebugEnabled()) {
     log.debug("Full context: {}", context);
 }

 方便后续排查。

 文档交付：doc/chat/ai-conversation-bug-analysis.md

 新建分析文档，包含以下内容：

 1. 问题现象

 基于 2026-02-06 14:32-14:35 实际对话数据（20 条消息），记录 3 类问题：
 - 重复回复: 消息 #4 和 #2 完全一致、#14/#16/#20 三次完全一致
 - 不理解追问: 用户回答 "体育 比如 c罗"，AI 仍问 "需要知道具体领域"
 - 答非所问: 用户问 "你为什么会卡顿"，AI 回复的是关于国际大师领域的答案

 2. 根因分析（附代码位置）

 三个根因（即上面 plan 中的根因 1/2/3），每个附具体代码行号和对话数据示例。

 3. 修复方案

 四个 Fix 的具体描述。

 4. 原始对话数据

 附完整 20 条 JSON 消息作为附录。

 ---
 关键文件
 ┌───────────────────────────────────────────────────────────────┬──────────────────────────────────────┐
 │                             文件                              │                 改动                 │
 ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
 │ doc/chat/ai-conversation-bug-analysis.md                      │ 新建：完整的问题分析文档（首先交付） │
 ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
 │ server/src/main/java/com/abao/service/AIService.java          │ Fix 1 + Fix 2 + Fix 4                │
 ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
 │ server/src/main/java/com/abao/event/MessageEventListener.java │ Fix 3                                │
 ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
 │ server/src/test/java/com/abao/service/AIServiceTest.java      │ 更新测试适配新 prompt 和 reply 标注  │
 └───────────────────────────────────────────────────────────────┴──────────────────────────────────────┘
 验证

 1. cd server && ./gradlew test — 后端测试全部通过
 2. 重新构建后端 Docker: docker-compose -f docker-compose.dev.yml up -d --build abao-server
 3. 用双账号脚本测试：
   - TestUser: "@AI 今天天气怎么样"
   - AI 回复后，Test2 引用 AI 消息追问 "北京的呢"
   - 验证 AI 能理解 "北京的呢" 是对天气回复的追问
 4. 检查 docker logs abao-server 确认 context 日志正常
 5. 连续追问 3 次，验证 AI 不再给出重复回复
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌

 Claude has written up a plan and is ready to execute. Would you like to proceed?