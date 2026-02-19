
# 结构化整理

## 1. MVP 范围界定

### 1.1 记忆系统（Memory）
基于 mom/agent.ts 现有实现，明确三层记忆机制与验收标准：

**永久记忆（Explicit Memory）**
- 用户故事：作为用户，我可以通过特定指令让 AI 永久记住信息，使其在任意未来会话中可用
- 触发条件：用户消息包含"记住这件事情"等显式指令
- 实现方式：Prompt 注入 + 持久化存储
- 验收标准：跨会话保留，@触发时自动携带相关记忆

**会话持久化（Session Persistence）**
- 用户故事：作为用户，我希望群聊历史在服务重启后依然保留
- 触发条件：每个群聊/频道自动维护
- 实现方式：每个群对应独立文件（与 mom 集成方式一致）
- 验收标准：服务重启后历史消息可恢复，文件路径与群 ID 映射稳定

**频道历史（Context Window）**
- 用户故事：作为用户，我希望 AI 能参考当前频道的近期对话进行回复
- 触发条件：当前频道内所有消息自动追加
- 实现方式：文件追加写入，超出 Token 限制时触发 LRU 或摘要截断策略
- 验收标准：支持@触发时关联上下文，支持引用回复时定位特定历史消息

### 1.2 工具调用（Tool Use）
- 状态：待补充（需定义触发条件、工具清单、参数规范）
mom自带四个tools，也能创造。
### 1.3 工具创造（Tool Creation）
- 状态：待补充（需定义生成规则、安全校验、存储方式）
这个mom自举能力，因为mom带热加载，你可以看代码。


另外还需要人格属性加进去：/Users/zfc/code/ai_chat/doc/chat/pi/soul.md
---

## 2. Java ↔ Node.js 通信契约

**推荐方案：HTTP/REST + JSON**

考虑到两端代码已就绪（Java: AIService.java, Node: mom/agent.ts），建议采用轻量级同步调用：

| 要素 | 定义 |
|------|------|
| **协议** | HTTP/1.1（保持简洁）或 Unix Domain Socket（同机部署时更优） |
| **格式** | JSON |
| **核心端点** | `POST /agent/handle`：消息处理与记忆查询<br>`POST /agent/execute`：工具/代码执行（对接 nsjail） |

**请求契约示例**：
```json
{
  "messageId": "uuid",
  "channelId": "group_123",
  "content": "用户消息内容",
  "triggerType": "mention",  // mention | quote | command
  "replyTo": null,           // 引用消息ID
  "context": {
    "history": [...],        // 当前频道历史（已截断）
    "permanentMemories": [...]  // 永久记忆注入
  }
}
```

**响应契约示例**：
```json
{
  "reply": "AI回复文本",
  "actions": [{
    "type": "tool_use | tool_create | memory_update",
    "payload": {...}
  }],
  "sandboxLogs": "..."      // 若执行了代码，返回 nsjail 输出
}
```

---

## 3. Agent 集成与沙盒方案

**执行环境：nsjail（推荐方案）**

| 对比项 | 结论 |
|--------|------|
| **选型** | nsjail（Apache-2.0，Google 出品） |
| **淘汰项** | E2B（收费）、Firecracker（需 KVM）、gVisor（内存开销高）、Docker（隔离弱）、bubblewrap（无 cgroups） |

**资源配置**：
```bash
nsjail \
  --mode o \
  --time_limit 30 \
  --rlimit_as 256 \      # 内存 256MB
  --rlimit_fsize 10 \    # 文件写入 10MB
  --disable_clone_newnet \  # 禁止网络
  --bindmount_ro / \     # 根目录只读
  --bindmount /tmp/sandbox-xxxx:/workspace  # 仅工作目录可写
```

**Node.js 集成层**：
- 封装为 `runInSandbox(code, timeout)` 函数
- 临时目录隔离：`/tmp/sandbox-${timestamp}`
- 生命周期管理：执行前创建 → 执行后清理（`rmSync`）
- 错误分类：超时（SIGKILL）vs 运行时错误（stderr）

**与现有代码集成**：
Node.js Agent 接收 Java 服务转发的消息后，如需执行生成的代码，直接调用上述沙盒函数，将 stdout/stderr 通过 HTTP 响应返回 Java 层，最终呈现给用户。