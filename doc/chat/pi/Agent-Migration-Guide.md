---
title: Pi Agent 迁移指南
version: v1.1
created: 2025-02-12
updated: 2025-02-12
author: fc zhang
---

# Pi Agent 迁移指南

## 1. 概述

### 1.1 本文档是什么

本文档面向**需要将 Pi Agent 迁移到其他项目**的开发者，涵盖：

- Agent 的核心架构与设计理念
- 最小可用集成方案
- 多模型 / 多 Provider 的接入方式（含国产模型）
- 自定义工具开发
- 完整的迁移步骤

### 1.2 项目结构总览

Pi Agent 由三个核心包组成，层级关系如下：

```
┌─────────────────────────────────────────────────┐
│                  你的应用层                       │
│         (Mom / chat.ts / 你的项目)                │
├─────────────────────────────────────────────────┤
│  @mariozechner/pi-coding-agent  (可选，会话管理)  │
├─────────────────────────────────────────────────┤
│  @mariozechner/pi-agent-core    (必选，Agent 核心) │
├─────────────────────────────────────────────────┤
│  @mariozechner/pi-ai            (必选，LLM 接口)  │
└─────────────────────────────────────────────────┘
```

| 包名 | 路径 | 职责 |
|------|------|------|
| `pi-ai` | `packages/ai/` | 统一 LLM 接口：模型注册、Provider 适配、流式调用 |
| `pi-agent-core` | `packages/agent/` | Agent 状态机：多轮对话、工具执行、事件系统 |
| `pi-coding-agent` | `packages/coding-agent/` | 会话管理：持久化、上下文压缩、扩展系统 |

### 1.3 支持的运行环境

| 环境 | 支持状态 | 说明 |
|------|---------|------|
| Node.js >= 20 | ✅ 完全支持 | 主要开发环境 |
| Bun | ✅ 支持 | 使用 Node.js 兼容 API |
| 浏览器 | ⚠️ 部分支持 | `pi-ai` 可用（无 fs/os），Agent 需适配 |
| tsx | ✅ 推荐 | 开发时直接运行 TS，无需编译 |

**包管理器**：pnpm（monorepo 首选）、npm、bun 均可。

---

## 2. 为什么 Agent 是核心

### 2.1 Agent 不只是「调 API 的封装」

Agent 是一个**有状态的事件驱动状态机**，解决了从「调一次 LLM API」到「构建可靠的 AI 应用」之间的所有工程问题：

```
调一次 API          Agent 解决的问题
    │
    ├── 多轮对话      → 自动管理消息历史
    ├── 工具调用      → 工具注册 → LLM 决策 → 执行 → 结果回传 → 继续推理
    ├── 流式输出      → 事件驱动，实时 UI 更新
    ├── 中断恢复      → steering（打断）/ followUp（追加）
    ├── 运行时热更新   → setTools / setSystemPrompt 无需重建实例
    └── 模型无关      → 同一套 Agent 代码，切换任意 LLM
```

### 2.2 一个 Agent 实例，多种应用形态

同一个 `Agent` 类，在 pi-mono 中已经驱动了三种不同的应用：

| 应用 | 入口 | 形态 |
|------|------|------|
| Coding Agent | `packages/coding-agent/` | 终端 IDE 助手（AgentSession 包装） |
| Mom | `packages/mom/` | Slack 机器人（每频道一个 Agent 实例） |
| chat.ts | `doc/learn/chat.ts` | 交互式教程（最简用法，含 Skills 热加载） |

它们共享 Agent 核心，只是在**工具集**、**系统提示词**和**IO 层**上不同。

### 2.3 关键设计决策

| 决策 | 选择 | 好处 |
|------|------|------|
| Agent 只管状态和循环 | 不绑定任何 IO/UI | 可嵌入 CLI、Web、Slack、任何地方 |
| 工具是运行时注入的 | `setTools()` 快照语义 | 热加载、按场景切换 |
| 模型是可插拔的 | Provider 注册机制 | 一行代码切换 Claude/GPT/Kimi/DeepSeek |
| 事件驱动 | `subscribe()` | 解耦 Agent 逻辑和 UI 渲染 |

---

## 3. Agent 核心能力

### 3.1 Agent 类 API 速览

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个有用的助手。",
    model: getModel("anthropic", "claude-sonnet-4-5-20250929"),
    thinkingLevel: "off",
    tools: [],
    messages: [],
  },
  convertToLlm: (msgs) => msgs.filter(m =>
    ["user", "assistant", "toolResult"].includes(m.role)
  ),
  getApiKey: async () => process.env.ANTHROPIC_API_KEY,
});
```

#### 状态管理

```typescript
agent.setSystemPrompt(prompt)     // 更新系统提示词
agent.setModel(model)             // 切换模型
agent.setThinkingLevel(level)     // 设置推理深度
agent.setTools(tools)             // 替换工具集（快照语义）
agent.replaceMessages(msgs)       // 替换全部历史
agent.appendMessage(msg)          // 追加消息
agent.clearMessages()             // 清空
agent.reset()                     // 重置全部状态
```

#### 对话控制

```typescript
await agent.prompt("你好")                 // 发送文本
await agent.prompt(message)                // 发送 AgentMessage
await agent.prompt([msg1, msg2])           // 批量发送
await agent.continue()                     // 从当前上下文继续
agent.steer(interruptMsg)                  // 打断当前执行
agent.followUp(followUpMsg)               // 完成后追加任务
agent.abort()                             // 中止
await agent.waitForIdle()                 // 等待空闲
```

#### 事件订阅

```typescript
const unsubscribe = agent.subscribe((event) => {
  switch (event.type) {
    case "turn_start":
    case "turn_end":
    case "message_start":
    case "message_update":        // 流式 delta
    case "message_end":
    case "tool_execution_start":
    case "tool_execution_end":
    case "agent_start":
    case "agent_end":
      break;
  }
});
```

### 3.2 事件流示例

一次包含工具调用的完整交互：

```
agent.prompt("列出当前目录的文件")
│
├─ agent_start
├─ turn_start
│   ├─ message_start  { role: "user" }
│   ├─ message_end    { role: "user" }
│   ├─ message_start  { role: "assistant" }
│   ├─ message_update { delta: "让我查看一下..." }
│   ├─ message_update { toolCall: { name: "bash", args: { command: "ls" } } }
│   ├─ message_end    { role: "assistant", stopReason: "toolUse" }
│   │
│   ├─ tool_execution_start  { toolName: "bash" }
│   ├─ tool_execution_end    { result: "file1.ts\nfile2.ts" }
│   │
│   ├─ message_start  { role: "toolResult" }
│   └─ message_end    { role: "toolResult" }
├─ turn_end { toolResults: [{ ... }] }
│
├─ turn_start              ← 自动进入下一轮
│   ├─ message_start  { role: "assistant" }
│   ├─ message_update { delta: "当前目录有以下文件：..." }
│   └─ message_end    { role: "assistant", stopReason: "stop" }
├─ turn_end { toolResults: [] }
│
└─ agent_end { messages: [...全部消息] }
```

### 3.3 工具定义

```typescript
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const bashTool: AgentTool<typeof bashSchema> = {
  name: "bash",
  label: "执行命令",
  description: "在 shell 中执行命令并返回输出",
  parameters: Type.Object({
    command: Type.String({ description: "要执行的 shell 命令" }),
  }),
  execute: async (toolCallId, args, signal, onUpdate) => {
    // onUpdate 可用于长任务的进度推送（可选）
    const output = execSync(args.command, { encoding: "utf-8" });
    return {
      content: [{ type: "text", text: output }],
      details: undefined,
    };
  },
};
```

**要点**：
- `parameters` 使用 TypeBox 的 `Type.Object()` 定义 JSON Schema
- `execute` 由 Agent 循环自动调用，不需要手动调用
- 返回 `{ content, details }`，content 遵循 LLM 消息格式
- 抛异常 = 告诉 LLM 工具执行失败

---

## 4. 模型与 Provider

### 4.1 已内置的 Provider

| Provider | API 类型 | 典型模型 |
|----------|---------|---------|
| Anthropic | `anthropic-messages` | Claude Sonnet 4.5, Opus 4 |
| OpenAI | `openai-completions` | GPT-4o, o3 |
| Google | `google-generative-ai` | Gemini 2.5 |
| Amazon Bedrock | `bedrock-converse-stream` | Claude via AWS |
| Google Vertex | `google-vertex` | Claude/Gemini via GCP |
| Kimi | `anthropic-messages` | K2.5（Anthropic 兼容） |
| MiniMax | `anthropic-messages` | MiniMax-M2 |
| DeepSeek | `openai-completions` | DeepSeek V3 |
| InternLM（书生） | `openai-completions` | intern-s1-pro |
| Groq / xAI / Mistral | `openai-completions` | 各自模型 |

### 4.2 使用模型

```typescript
import { getModel } from "@mariozechner/pi-ai";

// 通过 provider + modelId 获取
const claude = getModel("anthropic", "claude-sonnet-4-5-20250929");
const kimi  = getModel("kimi-coding", "k2p5");
const intern = getModel("intern", "intern-s1-pro");

// 直接用于 Agent
agent.setModel(intern);
```

### 4.3 API Key 解析

API Key 按以下优先级解析：

```
1. Agent 构造时的 getApiKey() 回调
2. AuthStorage（auth.json 文件）
3. 环境变量（自动映射）
```

**环境变量映射**：

| Provider | 环境变量 |
|----------|---------|
| anthropic | `ANTHROPIC_API_KEY` |
| openai | `OPENAI_API_KEY` |
| google | `GEMINI_API_KEY` |
| kimi-coding | `KIMI_API_KEY` |
| intern | `INTERN_API_KEY` |
| groq | `GROQ_API_KEY` |
| xai | `XAI_API_KEY` |

### 4.4 添加自定义 Provider

如果要接入一个新的 LLM API：

```typescript
import { registerApiProvider } from "@mariozechner/pi-ai";
import type { Model, Context, StreamOptions } from "@mariozechner/pi-ai";
import { AssistantMessageEventStream } from "@mariozechner/pi-ai";

registerApiProvider({
  api: "my-custom-api",
  stream: (model, context, options) => {
    const stream = new AssistantMessageEventStream();
    // 实现流式调用逻辑
    // 发射 start → text_delta → done 事件
    return stream;
  },
  streamSimple: (model, context, options) => {
    // 同上，简化版
  },
});
```

### 4.5 InternLM 兼容性说明

InternLM（书生大模型）部署在阿里云上，有以下兼容性限制：

| 特性 | 支持状态 | 说明 |
|------|---------|------|
| 基础对话 | ✅ | 正常 |
| 流式输出 | ✅ | 无 tools 时正常流式 |
| 工具调用 | ✅ | 自动降级为非流式（已处理） |
| 流式 + 工具 | ⚠️ | API 不支持，pi-ai 自动降级处理 |
| 复杂 system prompt | ❌ | 阿里云 WAF 可能拦截含 shell 命令的内容 |

compat 配置（已内置）：

```typescript
compat: {
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsUsageInStreaming: false,
  maxTokensField: "max_tokens",
  supportsStrictMode: false,
  supportsStreamingWithTools: false,  // 关键：自动降级
}
```

---

## 5. 迁移步骤

### 5.1 最小迁移（仅 Agent + AI）

适用于：只需要多轮对话 + 工具调用，不需要会话持久化。

**依赖**：

```json
{
  "dependencies": {
    "@mariozechner/pi-agent-core": "^0.52.9",
    "@mariozechner/pi-ai": "^0.52.9"
  }
}
```

**代码**：

```typescript
import { Agent, type AgentEvent, type AgentTool } from "@mariozechner/pi-agent-core";
import { getModel, Type } from "@mariozechner/pi-ai";

// 1. 选择模型
const model = getModel("kimi-coding", "k2p5");

// 2. 定义工具
const tools: AgentTool<any>[] = [/* 你的工具 */];

// 3. 创建 Agent
const agent = new Agent({
  initialState: {
    systemPrompt: "你的提示词",
    model,
    tools,
  },
  getApiKey: async () => process.env.KIMI_API_KEY,
});

// 4. 订阅事件（用于 UI）
agent.subscribe((event: AgentEvent) => {
  if (event.type === "message_update") {
    const e = event.assistantMessageEvent;
    if (e.type === "text_delta") process.stdout.write(e.delta);
  }
});

// 5. 开始对话
await agent.prompt("你好！");
```

**这就是全部。** 不需要 AgentSession、不需要 SessionManager、不需要 SettingsManager。

### 5.2 完整迁移（含会话管理）

适用于：需要持久化、上下文压缩、扩展系统。

额外依赖：

```json
{
  "dependencies": {
    "@mariozechner/pi-coding-agent": "^0.52.9"
  }
}
```

需要实现的接口：

```typescript
import {
  AgentSession,
  SessionManager,
  ModelRegistry,
  AuthStorage,
  convertToLlm,
} from "@mariozechner/pi-coding-agent";

// SessionManager: 消息持久化到 JSONL 文件
const sessionManager = SessionManager.open(contextFile, sessionDir);

// SettingsManager: 至少实现这些方法
const settingsManager = {
  getCompactionSettings: () => ({ enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 }),
  getCompactionEnabled: () => true,
  setCompactionEnabled: (_: boolean) => {},
  getRetrySettings: () => ({ enabled: true, maxRetries: 3, baseDelayMs: 2000 }),
  getRetryEnabled: () => true,
  setRetryEnabled: (_: boolean) => {},
  getDefaultThinkingLevel: () => "off",
  setDefaultThinkingLevel: (_: string) => {},
  getSteeringMode: () => "one-at-a-time" as const,
  setSteeringMode: (_: any) => {},
  getFollowUpMode: () => "one-at-a-time" as const,
  setFollowUpMode: (_: any) => {},
  getHookPaths: () => [],
  getHookTimeout: () => 30000,
  getImageAutoResize: () => false,
  getShellCommandPrefix: () => undefined,
  getBranchSummarySettings: () => ({ reserveTokens: 16384 }),
  getTheme: () => undefined,
  reload: () => {},
};

// ResourceLoader: 最小实现
const resourceLoader = {
  getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
  getSkills: () => ({ skills: [], diagnostics: [] }),
  getPrompts: () => ({ prompts: [], diagnostics: [] }),
  getThemes: () => ({ themes: [], diagnostics: [] }),
  getAgentsFiles: () => ({ agentsFiles: [] }),
  getSystemPrompt: () => systemPrompt,
  getAppendSystemPrompt: () => [],
  getPathMetadata: () => new Map(),
  extendResources: () => {},
  reload: async () => {},
};

// 组装
const session = new AgentSession({
  agent,
  sessionManager,
  settingsManager: settingsManager as any,
  cwd: process.cwd(),
  modelRegistry: new ModelRegistry(new AuthStorage(authPath)),
  resourceLoader,
});
```

### 5.3 模型切换（通过环境变量）

推荐模式——通过环境变量控制模型选择：

```typescript
const model = getModel(
  process.env.AI_PROVIDER || "anthropic",
  process.env.AI_MODEL || "claude-sonnet-4-5-20250929",
);
```

启动时切换：

```bash
# Claude
AI_PROVIDER=anthropic AI_MODEL=claude-sonnet-4-5-20250929 ANTHROPIC_API_KEY=sk-xxx node app.js

# Kimi
AI_PROVIDER=kimi-coding AI_MODEL=k2p5 KIMI_API_KEY=sk-xxx node app.js

# InternLM
AI_PROVIDER=intern AI_MODEL=intern-s1-pro INTERN_API_KEY=sk-xxx node app.js
```

---

## 6. 完整示例：最小可运行 Agent

以下是一个完整的、可直接运行的最小示例：

```typescript
// minimal-agent.ts
import { Agent, type AgentEvent, type AgentTool } from "@mariozechner/pi-agent-core";
import { getModel, Type } from "@mariozechner/pi-ai";
import { execSync } from "node:child_process";
import * as readline from "node:readline";

// ── 模型 ──
const model = getModel(
  (process.env.AI_PROVIDER as any) || "kimi-coding",
  process.env.AI_MODEL || "k2p5",
);

// ── 工具 ──
const bashTool: AgentTool<any> = {
  name: "bash",
  label: "Shell",
  description: "执行 shell 命令",
  parameters: Type.Object({
    command: Type.String({ description: "要执行的命令" }),
  }),
  execute: async (_id, args) => {
    try {
      const out = execSync(args.command, { encoding: "utf-8", timeout: 10000 });
      return { content: [{ type: "text", text: out || "(无输出)" }], details: undefined };
    } catch (e: any) {
      return { content: [{ type: "text", text: `错误: ${e.message}` }], details: undefined };
    }
  },
};

// ── Agent ──
const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个有用的助手，用中文回答。",
    model,
    tools: [bashTool],
  },
  getApiKey: async () => {
    // 根据 model.provider 自动查找对应环境变量
    const map: Record<string, string> = {
      "kimi-coding": "KIMI_API_KEY",
      "anthropic": "ANTHROPIC_API_KEY",
      "intern": "INTERN_API_KEY",
    };
    return process.env[map[model.provider] || ""] || "";
  },
});

// ── 事件 → 终端输出 ──
agent.subscribe((e: AgentEvent) => {
  if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(e.assistantMessageEvent.delta);
  }
  if (e.type === "tool_execution_start") {
    process.stdout.write(`\n[工具: ${e.toolName}]\n`);
  }
  if (e.type === "agent_end") {
    process.stdout.write("\n");
  }
});

// ── REPL ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = () => rl.question("\n> ", async (input) => {
  if (input.trim() === "/quit") return rl.close();
  await agent.prompt(input);
  ask();
});
ask();
```

运行：

```bash
KIMI_API_KEY=sk-xxx npx tsx minimal-agent.ts
```

---

## 7. 多 Agent 协作

### 7.1 现状评估

pi-mono 的 Agent **天然支持多实例并发**——每个 `new Agent()` 完全隔离，无全局状态。但**目前缺少协作层**：

| 能力 | 支持状态 | 说明 |
|------|---------|------|
| 多 Agent 实例并发 | ✅ 支持 | 每个实例独立状态，同进程内可运行多个 |
| Agent 间通信 | ❌ 未内置 | 需自行实现消息路由 |
| 共享上下文 | ❌ 未内置 | 每个 Agent 独立消息历史 |
| 编排/调度 | ❌ 未内置 | 需自行实现 Orchestrator |
| 工具代理调用 | ❌ 未内置 | Agent A 无法直接调用 Agent B 的工具 |

### 7.2 已有的多 Agent 模式

项目中已存在两种运行多个 Agent 的模式：

**模式 A：进程级隔离（subagent 扩展）**

```
coding-agent/examples/extensions/subagent/index.ts
```

- 每个子 Agent 是独立 `pi` 进程
- 最多 8 并行任务，并发上限 4
- 支持三种模式：single（单任务）、parallel（并行）、chain（链式传递）
- 通过 JSON stdout 通信
- 完全隔离，安全但重量级

**模式 B：实例级隔离（Mom Slack 机器人）**

```
mom/src/agent.ts → channelRunners: Map<channelId, AgentRunner>
```

- 每个 Slack 频道一个 Agent 实例
- 共享进程，各自独立的消息历史和上下文
- 通过文件系统共享 workspace 级 MEMORY.md
- 轻量级但 Agent 之间无法直接通信

### 7.3 推荐架构：进程内多 Agent + 消息总线

适用于「弹幕 Agent」「策略 Agent」这类需要实时协作的场景。核心思路是：**每个 Agent 有一个桥接工具 `send_to_agent`，通过 Orchestrator 路由到其他 Agent**。

```
┌───────────────────────────────────────────────────┐
│                  Orchestrator                      │
│            (普通 JS/TS 代码，非 Agent)              │
│                                                   │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐     │
│  │  弹幕Agent │  │  策略Agent │  │  执行Agent │     │
│  │           │  │           │  │           │     │
│  │ 职责:     │  │ 职责:     │  │ 职责:     │     │
│  │  解析弹幕  │  │  分析意图  │  │  执行动作  │     │
│  │  情感分析  │  │  制定策略  │  │  反馈结果  │     │
│  │           │  │           │  │           │     │
│  │ tools:    │  │ tools:    │  │ tools:    │     │
│  │  parse    │  │  query_db │  │  bash     │     │
│  │  classify │  │  plan     │  │  api_call │     │
│  │  ──────── │  │  ──────── │  │  ──────── │     │
│  │ 桥接工具:  │  │ 桥接工具:  │  │ 桥接工具:  │     │
│  │  send_to  │  │  send_to  │  │  send_to  │     │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘     │
│        │              │              │            │
│        └──────────────┼──────────────┘            │
│                       │                           │
│              ┌────────┴────────┐                  │
│              │   Message Bus   │                  │
│              │  (EventEmitter) │                  │
│              └─────────────────┘                  │
└───────────────────────────────────────────────────┘
```

### 7.4 实现方案

#### 7.4.1 Orchestrator 核心

```typescript
import { Agent, type AgentTool, type AgentEvent } from "@mariozechner/pi-agent-core";
import { getModel, Type } from "@mariozechner/pi-ai";
import { EventEmitter } from "node:events";

interface AgentNode {
  name: string;
  agent: Agent;
  systemPrompt: string;
  tools: AgentTool<any>[];          // 专属工具
}

class Orchestrator {
  private agents = new Map<string, AgentNode>();
  private bus = new EventEmitter();

  /** 注册一个 Agent */
  register(name: string, systemPrompt: string, tools: AgentTool<any>[] = []): Agent {
    const agent = new Agent({
      initialState: {
        systemPrompt: this.buildPrompt(name, systemPrompt),
        model: getModel(
          process.env.AI_PROVIDER || "kimi-coding",
          process.env.AI_MODEL || "k2p5",
        ),
        tools: [...tools, this.createBridgeTool(name)],
      },
      getApiKey: async () => this.resolveApiKey(),
    });

    this.agents.set(name, { name, agent, systemPrompt, tools });

    // 监听其他 Agent 发来的消息
    this.bus.on(`to:${name}`, async ({ from, message, resolve, reject }) => {
      try {
        await agent.waitForIdle();
        let reply = "";
        const unsub = agent.subscribe((e: AgentEvent) => {
          if (e.type === "message_update"
              && e.assistantMessageEvent.type === "text_delta") {
            reply += e.assistantMessageEvent.delta;
          }
        });
        await agent.prompt(`[来自 ${from}]: ${message}`);
        unsub();
        resolve(reply || "(无回复)");
      } catch (err) {
        reject(err);
      }
    });

    return agent;
  }

  /** 向指定 Agent 发消息（外部入口） */
  async send(targetAgent: string, message: string): Promise<string> {
    const node = this.agents.get(targetAgent);
    if (!node) throw new Error(`Agent "${targetAgent}" 不存在`);
    await node.agent.waitForIdle();

    let reply = "";
    const unsub = node.agent.subscribe((e: AgentEvent) => {
      if (e.type === "message_update"
          && e.assistantMessageEvent.type === "text_delta") {
        reply += e.assistantMessageEvent.delta;
      }
    });
    await node.agent.prompt(message);
    unsub();
    return reply;
  }

  /** 创建桥接工具——让 Agent 能调用其他 Agent */
  private createBridgeTool(selfName: string): AgentTool<any> {
    const orchestrator = this;
    return {
      name: "send_to_agent",
      label: "发送消息给其他 Agent",
      description:
        `向另一个 Agent 发送消息并获取回复。可用的 Agent: ` +
        `${[...this.agents.keys()].filter(n => n !== selfName).join(", ") || "(稍后注册)"}`,
      parameters: Type.Object({
        target: Type.String({ description: "目标 Agent 名称" }),
        message: Type.String({ description: "要发送的内容" }),
      }),
      execute: async (_id, args) => {
        return new Promise((resolve, reject) => {
          if (args.target === selfName) {
            resolve({
              content: [{ type: "text", text: "错误：不能给自己发消息" }],
              details: undefined,
            });
            return;
          }
          if (!orchestrator.agents.has(args.target)) {
            resolve({
              content: [{ type: "text",
                text: `错误：Agent "${args.target}" 不存在。` +
                  `可用: ${[...orchestrator.agents.keys()].join(", ")}` }],
              details: undefined,
            });
            return;
          }

          orchestrator.bus.emit(`to:${args.target}`, {
            from: selfName,
            message: args.message,
            resolve: (reply: string) => resolve({
              content: [{ type: "text", text: reply }],
              details: undefined,
            }),
            reject,
          });
        });
      },
    };
  }

  /** 构建系统提示词，注入协作上下文 */
  private buildPrompt(name: string, base: string): string {
    return `${base}\n\n## 协作\n你是 "${name}" Agent。` +
      `你可以使用 send_to_agent 工具与其他 Agent 协作。`;
  }

  /** 所有 Agent 注册完后，更新各自的桥接工具描述（刷新可用列表） */
  refreshTools(): void {
    for (const [name, node] of this.agents) {
      node.agent.setTools([...node.tools, this.createBridgeTool(name)]);
    }
  }

  private resolveApiKey(): string {
    const map: Record<string, string> = {
      "kimi-coding": "KIMI_API_KEY",
      "anthropic": "ANTHROPIC_API_KEY",
      "intern": "INTERN_API_KEY",
      "openai": "OPENAI_API_KEY",
    };
    const provider = (process.env.AI_PROVIDER || "kimi-coding");
    return process.env[map[provider] || ""] || "";
  }
}
```

#### 7.4.2 使用示例

```typescript
const orch = new Orchestrator();

// 注册「弹幕 Agent」—— 解析和分类弹幕
orch.register("弹幕", "你负责解析弹幕消息，提取用户意图和情感。", [
  parseTool,      // 解析弹幕格式
  classifyTool,   // 分类（提问/吐槽/点歌/...）
]);

// 注册「策略 Agent」—— 根据弹幕意图制定响应策略
orch.register("策略", "你根据弹幕分析结果制定响应策略。", [
  queryDbTool,    // 查询知识库
  planTool,       // 制定行动计划
]);

// 注册「执行 Agent」—— 执行具体动作
orch.register("执行", "你负责执行策略 Agent 的指令，调用外部 API。", [
  bashTool,       // 执行命令
  apiCallTool,    // 调用外部 API
]);

// 注册完毕，刷新桥接工具描述
orch.refreshTools();

// 发起一轮协作
const result = await orch.send("弹幕", "用户发送了弹幕: '主播能唱一首周杰伦的歌吗？'");
console.log(result);
```

**执行流程**：

```
orch.send("弹幕", "用户弹幕: '主播能唱一首周杰伦的歌吗？'")
│
├─ 弹幕 Agent 收到消息
│   ├─ 调用 classify 工具 → 分类为「点歌请求」
│   ├─ 调用 send_to_agent("策略", "点歌请求: 周杰伦")
│   │   │
│   │   └─ 策略 Agent 收到消息
│   │       ├─ 调用 query_db → 查到曲库有《晴天》《稻香》
│   │       ├─ 调用 plan → 制定策略: 推荐《晴天》
│   │       ├─ 调用 send_to_agent("执行", "播放《晴天》")
│   │       │   │
│   │       │   └─ 执行 Agent 收到消息
│   │       │       ├─ 调用 api_call → 触发播放
│   │       │       └─ 返回 "已开始播放《晴天》"
│   │       │
│   │       └─ 返回 "已安排播放周杰伦《晴天》"
│   │
│   └─ 返回最终回复给用户
```

### 7.5 架构选型对比

| 方案 | 适用场景 | 延迟 | 隔离性 | 复杂度 |
|------|---------|------|--------|--------|
| **进程内 + EventEmitter**<br>(上述方案) | 实时协作、低延迟 | 低 | 实例级 | 中 |
| **进程级隔离**<br>(subagent 模式) | 安全敏感、重计算 | 高 | 进程级 | 低 |
| **文件共享**<br>(Mom MEMORY.md 模式) | 松耦合、异步 | 高 | 完全 | 低 |
| **外部消息队列**<br>(Redis/NATS) | 分布式、跨机器 | 中 | 完全 | 高 |

### 7.6 注意事项

**并发控制**：每个 Agent 同一时刻只能处理一个 `prompt()`。当 Agent A 通过桥接工具调用 Agent B 时，A 在等待 B 的回复期间处于工具执行中（不阻塞 A 的事件循环，但 A 不接受新 prompt）。

**避免死锁**：不要让 Agent A 等 Agent B 的回复，同时 B 又在等 A。设计时应确保调用链是 **DAG（有向无环图）**：

```
✅ 正确: 弹幕 → 策略 → 执行（单向链）
✅ 正确: 弹幕 → 策略, 弹幕 → 执行（扇出）
❌ 死锁: 弹幕 ←→ 策略（双向等待）
```

**工具描述更新**：新 Agent 注册后需调用 `refreshTools()` 更新所有 Agent 的桥接工具描述（让 LLM 知道有哪些可用的 Agent）。

**上下文膨胀**：每次 Agent 间通信都会在双方的消息历史中留下记录。长时间运行需配合 AgentSession 的 auto-compaction 或定期 `clearMessages()`。

---

## 8. 参考资料

| 资源 | 路径 |
|------|------|
| Agent 源码 | `packages/agent/src/agent.ts` |
| Agent 类型定义 | `packages/agent/src/types.ts` |
| Agent README | `packages/agent/README.md` |
| AI 流式接口 | `packages/ai/src/stream.ts` |
| 模型注册表 | `packages/ai/src/models.generated.ts` |
| Provider 注册 | `packages/ai/src/providers/register-builtins.ts` |
| 环境变量映射 | `packages/ai/src/env-api-keys.ts` |
| Mom 集成示例 | `packages/mom/src/agent.ts` |
| Chat 教程示例 | `doc/learn/chat.ts` |
| AgentSession 包装 | `packages/coding-agent/src/core/agent-session.ts` |
| Subagent 扩展（多 Agent 进程模式） | `packages/coding-agent/examples/extensions/subagent/index.ts` |
| Mom 频道隔离（多 Agent 实例模式） | `packages/mom/src/agent.ts:395` (`channelRunners`) |
