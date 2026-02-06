# E2E 测试计划：双账号群聊实时消息测试

## 测试目标

用两个已注册账号测试完整的群聊流程：
1. 双窗口登录
2. 加入同一群聊
3. 发送消息 & 实时同步验证
4. @AI 触发回复

---

## 测试账号

| 账号 | 邮箱 | 密码 | 昵称 |
|------|------|------|------|
| A | test@example.com | Test12345 | TestUser |
| B | test2@example.com | Test12345 | Test2 |

---

## 环境启动指南

### 方式一：Docker Compose（推荐）

```bash
# 1. 启动后端服务（PostgreSQL + Redis + Spring Boot）
cd /Users/zfc/code/ai_chat
docker-compose -f docker-compose.dev.yml up -d

# 2. 验证服务状态
docker ps
# 应该看到: abao-server, abao-postgres, abao-redis

# 3. 检查后端日志
docker logs abao-server --tail 20
# 应该看到: Started AbaoApplication in xxx seconds

# 4. 测试后端 API
curl http://localhost:8080/api/groups
# 应该返回 401 Unauthorized（说明服务正常）

# 5. 启动前端 Flutter Web
cd app
flutter run -d chrome --web-port=58939
```

### 方式二：本地开发（需要本地 PostgreSQL/Redis）

```bash
# 1. 启动后端
cd /Users/zfc/code/ai_chat/server
./gradlew bootRun

# 2. 启动前端
cd /Users/zfc/code/ai_chat/app
flutter run -d chrome --web-port=58939
```

### 环境变量配置

如果需要 AI 功能，确保 `.env` 文件包含：
```bash
DEEPSEEK_API_KEY=sk-你的密钥  # 必须配置才能 @AI 回复
```

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Spring Boot 后端 | 8080 | API + WebSocket |
| Flutter Web 前端 | 58939 | 可自定义 |
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存 |

---

## 测试步骤

### Phase 1: 双窗口登录

| 步骤 | Tab 1 (TestUser) | Tab 2 (Test2) |
|------|------------------|---------------|
| 1 | 打开 http://localhost:58939 | 打开新 Tab，访问同一地址 |
| 2 | 输入 test@example.com + Test12345 | 输入 test2@example.com + Test12345 |
| 3 | 点击登录，验证进入群聊列表 | 点击登录，验证进入群聊列表 |

**验证点**：两个账号都成功登录，看到群聊列表页面

### Phase 2: 进入群聊

| 步骤 | Tab 1 (TestUser) | Tab 2 (Test2) |
|------|------------------|---------------|
| 4 | 检查是否有已存在的群聊 | — |
| 5a | 如果有群 → 点击进入 | — |
| 5b | 如果没群 → 点击 + → 创建群聊 | — |
| 6 | 点击右上角设置，复制邀请码 | — |
| 7 | — | 点击 + → 加入群聊 |
| 8 | — | 输入邀请码，点击加入 |
| 9 | — | 进入同一群聊 |

**验证点**：两个账号都在同一个群聊中

### Phase 3: 消息发送 & 实时同步

| 步骤 | Tab 1 | Tab 2 | 验证点 |
|------|-------|-------|--------|
| 10 | 输入 "Hello from A"，点击发送 | — | Tab 1 看到消息 |
| 11 | — | — | Tab 2 实时收到消息（无需刷新） |
| 12 | — | 输入 "Hello from B"，点击发送 | Tab 2 看到消息 |
| 13 | — | — | Tab 1 实时收到消息（无需刷新） |

**验证点**：WebSocket 实时推送正常，消息双向同步

### Phase 4: @AI 触发回复

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 14 | Tab 1 点击 @AI 按钮 | 输入框出现 "@AI " |
| 15 | 输入 "你好，请介绍一下自己"，发送 | 消息发送成功 |
| 16 | 等待 AI 响应（≤5秒） | Tab 1 和 Tab 2 都收到 AI 回复 |

**验证点**：@AI 触发机制正常，AI 回复实时同步到所有群成员

---

## Playwright 自动化执行

使用 Playwright MCP 工具执行测试：

```
# 打开第一个 Tab 并登录 TestUser
browser_navigate → http://localhost:58939
browser_snapshot → 确认在登录页
browser_type → 输入邮箱
browser_type → 输入密码
browser_click → 点击登录

# 打开第二个 Tab 并登录 Test2
browser_tabs action=new
browser_navigate → http://localhost:58939
... 重复登录流程 ...

# 切换 Tab 进行交互测试
browser_tabs action=select index=0  # 切换到 Tab 1
browser_tabs action=select index=1  # 切换到 Tab 2
```

---

## 预期产出

1. **测试通过截图** - 每个关键步骤的页面截图
2. **消息同步验证** - 证明 WebSocket 实时推送正常
3. **AI 响应验证** - 证明 @AI 触发机制正常

---

## 潜在风险 & 应对

| 风险 | 排查方法 | 应对方案 |
|------|----------|----------|
| 后端未启动 | `docker logs abao-server` | 重启 docker-compose |
| 端口未映射 | `docker port abao-server` | 重新 `docker-compose up -d` |
| WebSocket 连接失败 | 浏览器 F12 → Network → WS | 检查 JWT token 是否有效 |
| AI 服务未配置 | 检查 `.env` 的 DEEPSEEK_API_KEY | 跳过 AI 测试或配置 API Key |
| Flutter 编译错误 | `flutter doctor` | 运行 `flutter pub get` |

---

## 常用调试命令

```bash
# 查看后端日志
docker logs abao-server -f

# 查看所有容器状态
docker ps -a

# 重启所有服务
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d

# 检查数据库中的测试账号
docker exec -it abao-postgres psql -U postgres -d abao -c "SELECT email, nickname FROM users;"

# 检查群聊数据
docker exec -it abao-postgres psql -U postgres -d abao -c "SELECT id, name, invite_code FROM groups;"

# 清理 Flutter 缓存
cd app && flutter clean && flutter pub get
```
