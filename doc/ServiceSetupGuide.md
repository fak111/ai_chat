# A宝 - 第三方服务准备指南

## 文档信息

| 项目 | 内容 |
|------|------|
| 版本 | v1.0 |
| 创建日期 | 2026-02-05 |
| 适用阶段 | MVP 开发前准备 |
| 预计耗时 | 2-3 小时 |

---

## 服务总览

| 序号 | 服务类型 | 选用方案 | 免费额度 | 必需程度 |
|------|----------|----------|----------|----------|
| 1 | AI 对话 | DeepSeek | 500万 tokens | ⭐ 必需 |
| 2 | 邮箱发送 | Resend | 3000 封/月 | ⭐ 必需 |
| 3 | 对象存储 | Cloudflare R2 | 10GB + 免费流量 | ⭐ 必需 |
| 4 | 数据库 | Supabase | 500MB | ⭐ 必需 |
| 5 | Redis 缓存 | Upstash | 10K 请求/天 | ⭐ 必需 |
| 6 | 后端部署 | Railway | $5/月额度 | 开发后期 |

**预估总成本**: MVP 阶段 ¥0-50/月

---

## 准备前须知

### 你需要准备的东西

- [ ] 一个常用邮箱（推荐 Gmail 或 QQ 邮箱）
- [ ] 手机号（国内手机号即可）
- [ ] 科学上网工具（部分海外服务需要）
- [ ] 一个域名（用于邮箱发信，约 ¥50-100/年）
- [ ] Visa/Mastercard 信用卡（部分服务验证用，不会扣费）

### 域名购买建议（如果还没有）

| 平台 | 网址 | 说明 |
|------|------|------|
| Namesilo | https://www.namesilo.com | 便宜，.com 约 $9/年 |
| Cloudflare | https://dash.cloudflare.com | 成本价，续费不涨价 |
| 阿里云万网 | https://wanwang.aliyun.com | 国内备案方便 |

**建议**: 买一个 `.com` 或 `.dev` 域名，比如 `abao.dev` 或 `abaoapp.com`

---

## 1. DeepSeek AI 服务

### 1.1 服务说明

| 项目 | 内容 |
|------|------|
| 官网 | https://platform.deepseek.com |
| 用途 | 提供 AI 对话能力（@AI 功能） |
| 免费额度 | 注册送 500 万 tokens（约等于 250 万汉字） |
| 计费方式 | 按 token 计费，¥1/百万 tokens |

### 1.2 注册步骤

```
第一步：打开官网
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
浏览器访问: https://platform.deepseek.com
点击右上角「登录」按钮
```

```
第二步：注册账号
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 点击「注册」
2. 输入手机号（支持国内手机号）
3. 获取验证码并填入
4. 设置密码
5. 点击「注册」完成
```

```
第三步：获取 API Key
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 登录后，点击左侧菜单「API Keys」
2. 点击「创建 API Key」按钮
3. 输入名称，比如「abao-app」
4. 点击确认，会显示一串 sk-xxxx 开头的密钥
5. ⚠️ 立即复制保存！只显示一次！
```

### 1.3 需要保存的信息

```
┌─────────────────────────────────────────────────────────────┐
│ DeepSeek 配置信息                                            │
├─────────────────────────────────────────────────────────────┤
│ API Base URL: https://api.deepseek.com/v1                   │
│ API Key:      sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx           │
│ 模型名称:      deepseek-chat                                 │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 验证是否成功

打开终端，运行以下命令测试（把 YOUR_API_KEY 换成你的密钥）：

```bash
curl https://api.deepseek.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

如果返回包含 `"content": "你好！"` 类似内容，说明配置成功。

### 1.5 省钱技巧

- 使用 `deepseek-chat` 模型，性价比最高
- 控制上下文长度，不要每次都发送完整历史记录
- 设置合理的 `max_tokens` 限制回复长度

---

## 2. Resend 邮箱服务

### 2.1 服务说明

| 项目 | 内容 |
|------|------|
| 官网 | https://resend.com |
| 用途 | 发送注册验证邮件 |
| 免费额度 | 3000 封/月，100 封/天 |
| 优势 | API 极简，到达率高 |

### 2.2 注册步骤

```
第一步：打开官网注册
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 浏览器访问: https://resend.com
2. 点击「Start for free」或「Get Started」
3. 可以用 GitHub 账号登录（推荐）或邮箱注册
```

```
第二步：添加域名（重要！）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 必须添加自己的域名才能正常发信，否则只能发给自己

1. 登录后进入 Dashboard
2. 点击左侧「Domains」菜单
3. 点击「Add Domain」按钮
4. 输入你的域名，比如: abao.dev
5. 选择地区: 选择离你近的（美国/欧洲/亚洲）
```

```
第三步：配置 DNS 记录
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
添加域名后，Resend 会给你几条 DNS 记录，需要添加到你的域名 DNS 设置中：

Resend 会显示类似这样的记录：
┌──────────┬─────────────────────────────┬─────────────────────────────────┐
│ 类型     │ 名称                         │ 值                               │
├──────────┼─────────────────────────────┼─────────────────────────────────┤
│ TXT      │ resend._domainkey           │ p=MIGfMA0GCSqGSIb3DQEBA...      │
│ TXT      │ @                           │ v=spf1 include:resend.com ~all  │
└──────────┴─────────────────────────────┴─────────────────────────────────┘

去你的域名 DNS 管理后台添加这些记录（下面有各平台教程）
```

```
第四步：在域名服务商添加 DNS（以 Cloudflare 为例）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 登录 Cloudflare Dashboard: https://dash.cloudflare.com
2. 选择你的域名
3. 点击左侧「DNS」→「Records」
4. 点击「Add Record」
5. 按照 Resend 给的信息，逐条添加
6. 类型选 TXT，名称和值照抄
7. 保存后等待 5-10 分钟生效
```

```
第五步：验证域名
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 回到 Resend 的 Domains 页面
2. 点击你的域名
3. 点击「Verify DNS」按钮
4. 如果所有记录都显示绿色 ✓，说明配置成功
5. 如果显示红色 ✗，等几分钟再试，DNS 生效需要时间
```

```
第六步：获取 API Key
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 点击左侧「API Keys」菜单
2. 点击「Create API Key」
3. 输入名称: abao-app
4. Permission 选择: Full Access（或 Sending Access）
5. 点击「Add」创建
6. ⚠️ 复制显示的 re_xxxx 密钥，只显示一次！
```

### 2.3 需要保存的信息

```
┌─────────────────────────────────────────────────────────────┐
│ Resend 配置信息                                              │
├─────────────────────────────────────────────────────────────┤
│ API Key:      re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx           │
│ 发件邮箱:      noreply@你的域名.com                          │
│ 发件人名称:    A宝                                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 验证是否成功

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "A宝 <noreply@你的域名.com>",
    "to": "你的邮箱@qq.com",
    "subject": "测试邮件",
    "html": "<p>恭喜！邮件服务配置成功！</p>"
  }'
```

如果你的邮箱收到邮件，说明配置成功！

### 2.5 省钱技巧

- 免费版 3000 封/月足够 MVP
- 避免频繁发送测试邮件
- 注册验证邮件设置有效期，减少重发

---

## 3. Cloudflare R2 对象存储

### 3.1 服务说明

| 项目 | 内容 |
|------|------|
| 官网 | https://cloudflare.com |
| 用途 | 存储用户头像、图片等静态资源 |
| 免费额度 | 10GB 存储 + 每月 1000 万次读取 |
| 最大优势 | **出口流量完全免费**（其他服务都要收费） |

### 3.2 注册步骤

```
第一步：注册 Cloudflare 账号
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 访问: https://dash.cloudflare.com/sign-up
2. 输入邮箱和密码注册
3. 验证邮箱
```

```
第二步：创建 R2 存储桶
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 登录 Cloudflare Dashboard
2. 点击左侧菜单「R2 Object Storage」
3. 首次使用需要添加支付方式（不会扣费，仅验证）
   - 点击「Purchase R2」或「Get Started」
   - 添加信用卡信息（Visa/Mastercard）
   - 免费额度内不扣费
4. 点击「Create bucket」创建存储桶
5. 输入名称: abao-storage（只能小写字母、数字、短横线）
6. 选择区域: 亚太地区（APAC）
7. 点击「Create bucket」
```

```
第三步：获取访问密钥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 在 R2 页面，点击右侧「Manage R2 API Tokens」
2. 点击「Create API token」
3. 输入名称: abao-app
4. 权限选择「Object Read & Write」
5. 指定存储桶: 选择 abao-storage
6. 点击「Create API Token」
7. ⚠️ 保存显示的信息：
   - Access Key ID
   - Secret Access Key
   - S3 Endpoint
```

```
第四步：配置公开访问（用于头像访问）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 进入 abao-storage 存储桶
2. 点击「Settings」标签
3. 找到「Public access」部分
4. 启用「R2.dev subdomain」获得一个公开访问域名
   - 会得到类似: abao-storage.xxx.r2.dev 的域名
5. 或者绑定自己的域名（推荐）:
   - 点击「Custom Domains」
   - 添加: cdn.你的域名.com
   - 按提示添加 DNS 记录
```

### 3.3 需要保存的信息

```
┌─────────────────────────────────────────────────────────────┐
│ Cloudflare R2 配置信息                                       │
├─────────────────────────────────────────────────────────────┤
│ Bucket Name:      abao-storage                              │
│ Access Key ID:    xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx          │
│ Secret Key:       xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  │
│ S3 Endpoint:      https://xxx.r2.cloudflarestorage.com     │
│ Public URL:       https://cdn.你的域名.com 或 R2.dev域名    │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 验证是否成功

使用 AWS CLI 测试（R2 兼容 S3 协议）：

```bash
# 安装 AWS CLI（如果没有）
# Mac: brew install awscli
# 或访问: https://aws.amazon.com/cli/

# 配置凭证
aws configure
# AWS Access Key ID: 填入你的 Access Key ID
# AWS Secret Access Key: 填入你的 Secret Key
# Default region: auto
# Default output format: json

# 测试上传
echo "test" > test.txt
aws s3 cp test.txt s3://abao-storage/test.txt \
  --endpoint-url https://你的账号ID.r2.cloudflarestorage.com

# 测试列出文件
aws s3 ls s3://abao-storage/ \
  --endpoint-url https://你的账号ID.r2.cloudflarestorage.com
```

### 3.5 省钱技巧

- R2 出口流量免费，尽管用
- 图片上传前压缩，节省存储空间
- 设置合理的缓存策略

---

## 4. Supabase 数据库

### 4.1 服务说明

| 项目 | 内容 |
|------|------|
| 官网 | https://supabase.com |
| 用途 | PostgreSQL 数据库托管 |
| 免费额度 | 500MB 数据库 + 1GB 文件存储 |
| 额外功能 | 自带 Auth、实时订阅（可选用） |

### 4.2 注册步骤

```
第一步：注册账号
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 访问: https://supabase.com
2. 点击「Start your project」
3. 使用 GitHub 登录（推荐）或邮箱注册
```

```
第二步：创建项目
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 点击「New Project」
2. 选择组织（默认有一个个人组织）
3. 填写项目信息:
   - Name: abao-app
   - Database Password: 设置一个强密码（⚠️ 记住它！）
   - Region: 选择 Northeast Asia (Tokyo) 或 Singapore
4. 点击「Create new project」
5. 等待 1-2 分钟创建完成
```

```
第三步：获取连接信息
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 项目创建完成后，进入项目 Dashboard
2. 点击左侧「Project Settings」（齿轮图标）
3. 点击「Database」菜单
4. 找到「Connection string」部分
5. 选择「JDBC」标签（Java 用这个）
6. 复制连接字符串，格式类似：
   jdbc:postgresql://db.xxx.supabase.co:5432/postgres
7. 记住你设置的数据库密码
```

```
第四步：获取 API 信息（可选，用于直连）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 点击「Project Settings」→「API」
2. 记录以下信息：
   - Project URL: https://xxx.supabase.co
   - anon public key: eyJxxxx（公开密钥）
   - service_role key: eyJxxxx（服务端密钥，保密！）
```

### 4.3 需要保存的信息

```
┌─────────────────────────────────────────────────────────────┐
│ Supabase 配置信息                                            │
├─────────────────────────────────────────────────────────────┤
│ 项目 URL:        https://xxxxxx.supabase.co                 │
│ 数据库主机:       db.xxxxxx.supabase.co                      │
│ 数据库端口:       5432                                       │
│ 数据库名:        postgres                                    │
│ 用户名:          postgres                                    │
│ 密码:           你设置的密码                                  │
│ JDBC URL:       jdbc:postgresql://db.xxx.supabase.co:5432/postgres │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 验证是否成功

方法一：使用 Supabase 自带的 SQL 编辑器

```
1. 在项目 Dashboard 点击左侧「SQL Editor」
2. 点击「New Query」
3. 输入: SELECT version();
4. 点击「Run」
5. 如果显示 PostgreSQL 版本号，说明正常
```

方法二：使用命令行连接

```bash
# 安装 psql（如果没有）
# Mac: brew install postgresql

# 连接测试
psql "postgresql://postgres:你的密码@db.xxx.supabase.co:5432/postgres"

# 连接成功会显示: postgres=>
# 输入 \q 退出
```

### 4.5 省钱技巧

- 免费版有 500MB 限制，消息表注意定期清理
- 项目 7 天不活跃会暂停，访问时自动恢复
- 不要存储大文件到数据库，用 R2

---

## 5. Upstash Redis 缓存

### 5.1 服务说明

| 项目 | 内容 |
|------|------|
| 官网 | https://upstash.com |
| 用途 | 缓存、Session 存储、在线状态 |
| 免费额度 | 每天 10,000 次请求 |
| 特点 | Serverless，按请求计费，空闲不花钱 |

### 5.2 注册步骤

```
第一步：注册账号
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 访问: https://console.upstash.com
2. 点击「Sign Up」
3. 使用 GitHub / Google 登录（推荐）或邮箱注册
```

```
第二步：创建 Redis 数据库
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 登录后点击「Create Database」
2. 填写信息:
   - Name: abao-cache
   - Type: Regional（单区域，免费）
   - Region: 选择 Asia Pacific (Singapore) 或 (Tokyo)
3. 点击「Create」
```

```
第三步：获取连接信息
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
创建完成后会直接显示连接信息：

1. 在数据库详情页找到「REST API」部分:
   - UPSTASH_REDIS_REST_URL
   - UPSTASH_REDIS_REST_TOKEN

2. 找到「Connect」部分的常规连接信息:
   - Endpoint: xxx.upstash.io
   - Port: 6379
   - Password: xxxxxx
```

### 5.3 需要保存的信息

```
┌─────────────────────────────────────────────────────────────┐
│ Upstash Redis 配置信息                                       │
├─────────────────────────────────────────────────────────────┤
│ Host:           xxx.upstash.io                              │
│ Port:           6379                                        │
│ Password:       xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx            │
│ 连接 URL:        redis://default:密码@xxx.upstash.io:6379   │
│                                                             │
│ REST URL:       https://xxx.upstash.io                      │
│ REST Token:     xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx            │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 验证是否成功

方法一：使用 Upstash 自带的 CLI

```
1. 在数据库详情页，点击「CLI」标签
2. 输入: PING
3. 如果返回 PONG，说明正常
4. 输入: SET test "hello"
5. 输入: GET test
6. 返回 "hello" 说明读写正常
```

方法二：使用 redis-cli

```bash
# 安装 redis-cli（如果没有）
# Mac: brew install redis

# 连接测试
redis-cli -h xxx.upstash.io -p 6379 -a 你的密码

# 连接成功后输入 PING，返回 PONG 说明正常
```

### 5.5 省钱技巧

- 免费版每天 10K 请求，合理使用缓存
- 设置合理的过期时间，减少无效请求
- 批量操作代替多次单独请求

---

## 6. Railway 后端部署（开发后期）

### 6.1 服务说明

| 项目 | 内容 |
|------|------|
| 官网 | https://railway.app |
| 用途 | 部署 Spring Boot 后端服务 |
| 免费额度 | $5/月（约 500 小时运行时间） |
| 特点 | Git 推送自动部署，对新手友好 |

### 6.2 注册步骤

```
第一步：注册账号
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 访问: https://railway.app
2. 点击「Login」
3. 使用 GitHub 登录（必须用 GitHub）
```

```
第二步：创建项目（开发完成后操作）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 点击「New Project」
2. 选择「Deploy from GitHub repo」
3. 授权 Railway 访问你的 GitHub
4. 选择后端项目仓库
5. Railway 会自动检测 Spring Boot 并配置
```

```
第三步：配置环境变量
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 进入项目设置
2. 点击「Variables」
3. 添加之前准备的所有配置:
   - DEEPSEEK_API_KEY=sk-xxx
   - RESEND_API_KEY=re_xxx
   - DATABASE_URL=jdbc:postgresql://xxx
   - REDIS_URL=redis://xxx
   - R2_ACCESS_KEY=xxx
   - 等等...
```

### 6.3 需要保存的信息

```
┌─────────────────────────────────────────────────────────────┐
│ Railway 配置信息（部署后获得）                                │
├─────────────────────────────────────────────────────────────┤
│ 项目 URL:       https://abao-api.up.railway.app             │
│ 部署状态:       https://railway.app/project/xxx             │
└─────────────────────────────────────────────────────────────┘
```

---

## 配置汇总模板

创建完所有服务后，将信息整理到一个安全的地方（比如密码管理器）：

```properties
# ============================================
# A宝 - 服务配置汇总
# 创建日期: 2026-02-XX
# ⚠️ 此文件包含敏感信息，请勿提交到 Git！
# ============================================

# === DeepSeek AI ===
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_MODEL=deepseek-chat

# === Resend 邮箱 ===
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
MAIL_FROM=noreply@你的域名.com
MAIL_FROM_NAME=A宝

# === Cloudflare R2 ===
R2_BUCKET=abao-storage
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ENDPOINT=https://账号ID.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://cdn.你的域名.com

# === Supabase PostgreSQL ===
DATABASE_HOST=db.xxxxxx.supabase.co
DATABASE_PORT=5432
DATABASE_NAME=postgres
DATABASE_USER=postgres
DATABASE_PASSWORD=你的数据库密码
DATABASE_URL=jdbc:postgresql://db.xxxxxx.supabase.co:5432/postgres?user=postgres&password=密码

# === Upstash Redis ===
REDIS_HOST=xxxxxx.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=xxxxxxxxxxxxxxxxxxxxxxxx
REDIS_URL=redis://default:密码@xxxxxx.upstash.io:6379

# === 域名相关 ===
DOMAIN=你的域名.com
API_DOMAIN=api.你的域名.com
CDN_DOMAIN=cdn.你的域名.com
```

---

## 检查清单

完成所有准备后，对照检查：

```
服务注册
├── [ ] DeepSeek 账号已注册
├── [ ] Resend 账号已注册
├── [ ] Cloudflare 账号已注册
├── [ ] Supabase 账号已注册
├── [ ] Upstash 账号已注册
└── [ ] 域名已购买

服务配置
├── [ ] DeepSeek API Key 已获取并测试
├── [ ] Resend 域名已验证，API Key 已获取
├── [ ] Cloudflare R2 存储桶已创建，密钥已获取
├── [ ] Supabase 项目已创建，连接串已获取
├── [ ] Upstash Redis 已创建，连接信息已获取
└── [ ] 所有配置信息已安全保存

验证测试
├── [ ] DeepSeek API 调用成功
├── [ ] Resend 发送测试邮件成功
├── [ ] R2 上传测试文件成功
├── [ ] Supabase 数据库连接成功
└── [ ] Upstash Redis PING 成功
```

---

## 常见问题

### Q1: Cloudflare R2 需要信用卡，但我没有怎么办？

**A**: 可以用以下替代方案：
- 使用 Supabase Storage（自带 1GB 免费存储）
- 使用 Backblaze B2（10GB 免费，无需信用卡）

### Q2: Resend 域名验证一直失败？

**A**:
1. DNS 记录生效需要时间，等待 10-30 分钟
2. 检查 DNS 记录是否正确复制（注意空格）
3. 使用 https://dnschecker.org 检查 DNS 是否生效

### Q3: Supabase 项目显示 "Paused"？

**A**: 免费项目 7 天不活跃会暂停，访问数据库时会自动恢复（需要等待 1-2 分钟）

### Q4: 免费额度用完了怎么办？

**A**:
- DeepSeek: 充值 ¥10 可以用很久
- Resend: 升级到 $20/月 或换用 AWS SES
- 其他服务: 免费额度对 MVP 足够，正式上线再考虑付费

---

## 下一步

服务全部准备好后，通知我，我们开始：
1. 初始化项目代码
2. 配置开发环境
3. 开始 Phase 1 开发
