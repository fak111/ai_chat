# Flutter Web E2E 调试笔记

## 最核心的坑

### 1. CanvasKit 渲染器 vs Playwright（最大坑）

Flutter Web 默认使用 CanvasKit，将所有 UI 渲染到 `<canvas>` 元素上。Playwright 的 DOM-based 工具（`browser_snapshot`、`browser_click` by ref）对此完全无效。

**表现**:
- `browser_snapshot` 返回空 YAML
- `browser_click` 找不到按钮、输入框等元素
- 截图能看到 UI 但无法交互

**解决方案**: 通过 Flutter Accessibility Semantics 树交互：

```javascript
// 1. 启用 accessibility（每次页面加载后必须执行）
document.querySelector('flt-semantics-placeholder[role="button"]').click();

// 2. 等待 1 秒让 semantics 树生成

// 3. 启用所有 semantics 节点的点击事件（默认 pointer-events: none）
document.querySelectorAll('flt-semantics').forEach(n => {
  n.style.pointerEvents = 'auto';
});

// 4. 枚举节点找到目标
document.querySelectorAll('flt-semantics').forEach(n => {
  const rect = n.getBoundingClientRect();
  console.log(n.id, n.getAttribute('role'), rect.x, rect.y, rect.width, rect.height);
});

// 5. 通过 ID 交互
document.querySelector('#flt-semantic-node-8').click();  // 点击
const input = document.querySelector('#flt-semantic-node-8 input');
input.focus();
// 然后用 page.keyboard.type() 输入文字
```

### 2. 文本输入只能用 keyboard.type()

直接设置 `input.value` 不会触发 Flutter 的内部状态更新。必须：
1. 先 focus 到 semantics input 节点
2. 再用 `page.keyboard.type('text', { delay: 30 })` 逐字符输入

```javascript
// 错误方式（Flutter 不接收）
input.value = 'test@example.com';
input.dispatchEvent(new Event('input'));

// 正确方式
input.focus();
await page.keyboard.type('test@example.com', { delay: 30 });
```

### 3. 双账号测试：同浏览器不可能

同一浏览器的多个 Tab 共享 `localStorage`（JWT token 存储位置）。登录第二个账号会覆盖第一个的 token。

**解决方案 — 混合模式**:
- Account A: 浏览器操作（视觉验证）
- Account B: curl API 操作（功能验证）
- 两者配合 + DB 查询做交叉验证

### 4. Semantics 节点 ID 不稳定

每次页面刷新后，`flt-semantic-node-*` 的 ID 编号会变。不能硬编码 ID，必须通过位置（getBoundingClientRect）+ role 属性动态查找。

### 5. 消息发送后 UI 不刷新（已知 Bug）

Release 静态部署模式下，WebSocket 可能未正确连接。消息通过 API 发送成功（DB 有记录），但 UI 不会自动显示新消息。需要整页刷新（navigate 到首页再进群）。

---

## 完整可行的 E2E 启动流程

### 前置准备

```bash
# 1. 启动后端服务
cd /Users/zfc/code/ai_chat
docker-compose -f docker-compose.dev.yml up -d

# 2. 验证后端就绪
curl --noproxy localhost http://localhost:8080/api/health
# 返回: {"status":"ok",...}

# 3. 构建 Flutter Web release 版本
cd app
flutter build web --release

# 4. 启动静态文件服务器
cd build/web
python3 -m http.server 9191 &
# Flutter Web 现在在 http://localhost:9191 可访问
```

### 为什么用 release build + python 而不是 flutter run？

| 方式 | 问题 |
|------|------|
| `flutter run -d chrome` | 需要 Chrome DevTools 连接，代理环境下经常超时 |
| `flutter run -d web-server` | 也有 DevTools 连接问题 |
| `flutter build web --release` + `python3 -m http.server` | 纯静态文件服务，无连接问题，Playwright 可直接访问 |

### 测试账号准备

```bash
# 注册测试用户（如果不存在）
curl --noproxy localhost -s -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Test12345","nickname":"TestUser"}'

curl --noproxy localhost -s -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test2@example.com","password":"Test12345","nickname":"Test2"}'

# 手动验证邮箱
docker exec abao-postgres psql -U postgres -d abao \
  -c "UPDATE users SET email_verified = true WHERE email IN ('test@example.com', 'test2@example.com');"

# 获取 token
TOKEN_A=$(curl --noproxy localhost -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Test12345"}' | jq -r '.accessToken')

TOKEN_B=$(curl --noproxy localhost -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test2@example.com","password":"Test12345"}' | jq -r '.accessToken')
```

### Playwright MCP 操作模板

```javascript
// === 启用 accessibility（每次页面加载后必做）===
() => {
  const btn = document.querySelector('flt-semantics-placeholder[role="button"]');
  if (btn) btn.click();
}
// 等待 1 秒

// === 启用 pointer-events + 查找节点 ===
() => {
  document.querySelectorAll('flt-semantics').forEach(n => {
    n.style.pointerEvents = 'auto';
  });
  const nodes = document.querySelectorAll('flt-semantics');
  const results = [];
  nodes.forEach(n => {
    const rect = n.getBoundingClientRect();
    results.push({
      id: n.id,
      role: n.getAttribute('role'),
      hasInput: !!n.querySelector('input'),
      inputType: n.querySelector('input')?.type,
      x: Math.round(rect.x), y: Math.round(rect.y),
      w: Math.round(rect.width), h: Math.round(rect.height)
    });
  });
  return results;
}

// === 登录操作 ===
// 1. focus email input (通常 type="text", y≈280)
// 2. page.keyboard.type('test@example.com', { delay: 30 })
// 3. focus password input (type="password", y≈350)
// 4. page.keyboard.type('Test12345', { delay: 30 })
// 5. click login button (role="button", y≈420)
// 6. 等待 3 秒
// 7. 截图验证

// === 进入群聊 ===
// 找 role="button" 且 y 在 56~120 范围的节点，click

// === 发送消息 ===
// 找底部的 text input (y≈863), focus → keyboard.type
// 找发送按钮 (role="button", y≈867), click

// === 强制刷新看新消息 ===
// browser_navigate 到 http://localhost:9191/
// 等待 3s，重新 enable accessibility，点击群进入
```

### 混合模式发消息（推荐）

```bash
# Account B 通过 API 发消息
GROUP_ID="你的群ID"
curl --noproxy localhost -s -X POST "http://localhost:8080/api/messages/group/$GROUP_ID" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' \
  -d '{"content":"消息内容"}'

# 带引用回复
AI_MSG_ID="要引用的消息ID"
curl --noproxy localhost -s -X POST "http://localhost:8080/api/messages/group/$GROUP_ID" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"@AI 追问内容\",\"replyToId\":\"$AI_MSG_ID\"}"

# 查数据库验证
docker exec abao-postgres psql -U postgres -d abao \
  -c "SELECT COALESCE(u.nickname, 'AI') as who, LEFT(m.content, 60), m.message_type, m.created_at \
      FROM messages m LEFT JOIN users u ON m.sender_id = u.id \
      WHERE m.group_id = '$GROUP_ID' ORDER BY m.created_at DESC LIMIT 5;"
```

### 清理

```bash
# 停止 python 服务器
kill $(lsof -t -i:9191)

# 停止后端
docker-compose -f docker-compose.dev.yml down
```

---

## 踩过的坑速查表

| 坑 | 现象 | 解决 |
|----|------|------|
| CanvasKit 不可见 | snapshot 空 | 用 semantics 节点 |
| input.value 无效 | Flutter 不收值 | keyboard.type() |
| pointer-events: none | 点击穿透 | JS override style |
| 双 Tab 共享 token | 第二账号覆盖第一个 | 混合模式 |
| 节点 ID 变化 | 刷新后 ID 不同 | 按位置+role 查找 |
| 消息不刷新 | DB 有但 UI 无 | 全页 navigate 刷新 |
| 代理拦截 | curl 返回 502 | `--noproxy localhost` |
| AI member NPE | 发消息 500 | null check user |
| flutter run 超时 | DevTools 连接失败 | release build + python |
| accessibility 未启用 | 找不到 semantics | 每次加载后 click placeholder |
