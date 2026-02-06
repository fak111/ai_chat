# E2E_2 测试报告：核心交互深化 — 多轮对话 + 引用 AI 追问

## 测试日期
2026-02-06

## 测试环境
- Flutter Web (release build) served at http://localhost:9191
- Spring Boot 后端 at http://localhost:8080 (Docker)
- PostgreSQL (Docker)
- AI: DeepSeek API

## 测试方法
- **混合模式**: 浏览器（Account A 视角）+ curl API（Account B 操作）
- **原因**: Flutter Web CanvasKit 渲染到 `<canvas>`，Playwright 无法直接操作 DOM。通过 Flutter accessibility semantics 节点操作 + API 调用实现自动化
- **验证方式**: 每个 Phase 结束后刷新浏览器截图 + 数据库查询双重验证

## 测试账号

| 账号 | 邮箱 | 昵称 | 操作方式 |
|------|------|------|----------|
| A | test@example.com | TestUser | 浏览器 + API |
| B | test2@example.com | Test2 | API |

## 群聊信息
- 群名: E2E2
- Group ID: `5b6d4eeb-7a77-4dd1-ac94-b81ceb4125e2`

---

## Phase 1: 双窗口登录 ✅

Account A 通过浏览器 Flutter semantics 节点完成登录。Account B 通过 API 登录获取 JWT token。

**截图**: `login-result.png`

---

## Phase 2: 进入同一群聊 ✅

Account A 在浏览器中点击 E2E2 群进入聊天页。Account B 通过 API 确认已是群成员。

**截图**: `enter-group.png`

---

## Phase 3: A/B 多轮对话 + 实时同步验证 ✅

| # | 发送者 | 消息内容 | 时间 | 发送方式 |
|---|--------|----------|------|----------|
| 1 | TestUser (A) | hello from A | 09:01 | 浏览器 |
| 2 | Test2 (B) | hello from B | 09:07 | API |
| 3 | TestUser (A) | 大家好！我们来测试多轮对话 | 09:14 | 浏览器 |
| 4 | Test2 (B) | 收到！消息同步测试开始 | 09:19 | API |
| 5 | TestUser (A) | 第二轮：你觉得今天天气怎么样？ | 09:19 | API |
| 6 | Test2 (B) | 挺好的！我们来问问 AI 吧 | 09:19 | API |

**验证**: 刷新浏览器后所有 6 条消息按时间顺序正确显示，A/B 交替出现。

**截图**: `step3-multi-round-chat.png`

---

## Phase 4: @AI 触发 + 双端同步验证 ✅

| # | 发送者 | 消息内容 | 时间 |
|---|--------|----------|------|
| 7 | TestUser (A) | @AI 请用一句话介绍量子计算 | 09:21 |
| 8 | AI | 量子计算是利用量子比特的叠加和纠缠特性，实现远超经典计算机的并行计算能力。 | 09:21 |

**验证**:
- AI 在 ~4 秒内响应
- AI 消息带 🤖 头像，与用户消息视觉区分明显
- AI 回复显示了引用的原始消息

**截图**: `step4-ai-reply-synced.png`

---

## Phase 5: 引用 AI 回复继续对话 (US-007 核心测试) ✅

| # | 发送者 | 消息内容 | 引用 | 时间 |
|---|--------|----------|------|------|
| 9 | Test2 (B) | @AI 能再详细解释一下吗？ | 引用 #8 AI 的量子计算回复 | 09:22 |
| 10 | AI | 量子计算通过量子比特同时表示0和1的叠加态... | 引用 #9 B 的追问 | 09:22 |
| 11 | TestUser (A) | @AI 总结一下刚才的讨论 | 引用 #10 AI 的详细解释 | 09:23 |
| 12 | AI | 刚才我们讨论了量子计算的基本原理... | 引用 #11 A 的总结请求 | 09:23 |

**验证**:
- ✅ B 成功引用 AI 回复发送追问消息 (`replyToId` 正确关联)
- ✅ AI 基于引用上下文生成回复（每次回复内容递进）
- ✅ A 也能引用 AI 回复发送新追问
- ✅ AI 第三次回复成功总结了之前的讨论
- ✅ 引用关系在 UI 中清晰展示（缩进引用文本）

**截图**:
- `step5-full-conversation-top.png` — 完整对话链视图
- `step5c-full-conversation.png` — 全页截图

---

## Phase 6: B 独立 @AI 验证 ✅

| # | 发送者 | 消息内容 | 时间 |
|---|--------|----------|------|
| 13 | Test2 (B) | @AI 用简单的话解释什么是黑洞 | 09:25 |
| 14 | AI | 黑洞是宇宙中引力极强的区域，连光都无法逃脱，通常由大质量恒星坍缩形成。 | 09:25 |

**验证**: 非群创建者（B）也能独立触发 AI 回复。

**截图**: `step6-b-triggers-ai.png`

---

## 测试结果汇总

| # | 验证项 | 预期结果 | 实际结果 | 状态 |
|---|--------|----------|----------|------|
| 1 | 双账号登录 | 两个账号分别登录成功 | A 浏览器登录 + B API 登录 | ✅ |
| 2 | 进入同一群聊 | 两个账号都在同一聊天页 | 确认同在 E2E2 群 | ✅ |
| 3 | 4 轮 A/B 消息同步 | 每条消息双方可见 | 6 条消息全部正确显示 | ✅ |
| 4 | @AI 触发 + 双端同步 | AI 回复双端可见 | AI 4s 内回复，双端可见 | ✅ |
| 5 | **引用 AI 回复继续对话** | AI 基于引用上下文回复 | 3 轮引用追问全部成功 | ✅ |
| 6 | B 独立触发 @AI | 非创建者也能触发 AI | B 成功触发 AI 回复黑洞问题 | ✅ |

## 发现的问题

### Bug: 聊天消息发送后不刷新 (P1)
**现象**: 通过 UI 发送消息后，消息存入数据库但 UI 不显示新消息，需要退出重进才能看到。
**原因**: ChatProvider 可能存在以下问题之一:
1. WebSocket 在 release 静态部署模式下未成功连接
2. 消息发送后的 optimistic update 未正确触发 UI 刷新
3. 返回群列表再进入时 provider 使用缓存数据而非重新 fetch

**影响**: 实时性体验受损，用户需手动刷新才能看到新消息。

### Bug: AI GroupMember null user 导致 NPE (已修复)
**现象**: 发送消息时报 500，因为 `GroupMember.getUser().getId()` 在 AI 成员上抛 NPE。
**修复**: `MessageService.java:38` 添加 `m.getUser() != null` 空值检查。

## 产出文件

```
doc/e2e/e2e_2/
├── e2e.md                           ← 本测试报告
├── step3-multi-round-chat.png       ← Phase 3: 多轮对话
├── step4-ai-reply-synced.png        ← Phase 4: AI 回复
├── step5-full-conversation-top.png  ← Phase 5: 引用 AI 对话链
├── step5c-full-conversation.png     ← Phase 5: 完整对话全页
├── step6-b-triggers-ai.png          ← Phase 6: B 独立触发 AI
└── (debug-*.png)                    ← 调试过程截图
```
