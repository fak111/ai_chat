---
title: A宝 CI/CD 方案指南
version: v1.1
created: 2026-02-15
updated: 2026-02-15
author: zfc
---

# A宝 CI/CD 方案指南

## 1. 概述

### 1.1 背景

A宝项目已完成 MVP 并部署上线，当前存在以下问题：
- 后端部署依赖本地手动执行 `deploy.sh`
- Android APK 构建需要本地环境 + 签名密钥
- GitHub Actions 中的 `deploy.yml` 仍使用已弃用的 Railway

### 1.2 方案选型

| 方案 | 成本 | 额外服务器 | 适合场景 |
|------|------|-----------|---------|
| **GitHub Actions** | 免费 2000 分钟/月 | **不需要** | 个人/小团队项目 |
| 自建 Jenkins | 服务器费用 | 需要 | 大型团队 |
| GitLab CI | 免费 400 分钟/月 | 不需要 | 代码在 GitLab |

**结论：GitHub Actions，不需要额外服务器。**

免费额度预估：
- Android APK 构建 ≈ 10 分钟/次
- 后端测试+构建 ≈ 5 分钟/次
- 后端部署 ≈ 3 分钟/次
- 每月发版 10 次 ≈ 180 分钟，远低于 2000 分钟上限

### 1.3 设计思路

单人开发，直接 push main，CI 在 push 时跑没有阻拦作用（形同虚设）。
因此采用**测试集成到 CD**的方案：打 tag 发版时先跑测试，通过才构建和部署。

- `ci.yml` — 仅 PR 触发（预留多人协作场景）
- `deploy.yml` — tag 触发，**测试 → 构建 APK → 部署后端**，测试不过全部中止

### 1.4 目标流水线

```
git tag v1.0.x && git push origin v1.0.x
    │
    ▼
┌─────────────────── Test Gate ──────────────────────────┐
│  后端 Gradle 测试 (PostgreSQL)                         │
│  前端 Flutter analyze + test                           │
└───────────────────────┬────────────────────────────────┘
                        │ 全部通过
              ┌─────────┴─────────┐
              ▼                   ▼
┌──────────────────┐  ┌──────────────────┐
│  Build Android   │  │  Deploy Backend  │
│  签名 APK        │  │  Docker → 服务器  │
│  → GitHub Release│  │  → 健康检查      │
└──────────────────┘  └──────────────────┘
```

## 2. 现状分析

### 2.1 已有 CI 工作流 (`.github/workflows/ci.yml`)

| Job | 功能 | 状态 |
|-----|------|------|
| `backend-test` | 后端 Gradle 测试 + PostgreSQL 服务 | ✅ 正常 |
| `backend-build` | 后端 JAR 构建 | ✅ 正常 |
| `frontend-test` | Flutter analyze + test | ✅ 正常 |

**问题**：Flutter 版本硬编码为 `3.19.0`，建议改为与 `pubspec.yaml` 一致。

### 2.2 已有 Deploy 工作流 (`.github/workflows/deploy.yml`)

| Job | 功能 | 状态 |
|-----|------|------|
| `deploy-backend` | 部署到 Railway | ❌ Railway 已弃用 |
| `build-android` | 构建 APK + GitHub Release | ⚠️ 未配置签名 |

### 2.3 当前手动部署流程 (`deploy.sh`)

```
本地 docker build (linux/amd64)
        │
        ▼
docker save → /tmp/abao-server.tar
        │
        ▼
SCP 上传到 118.196.78.215:/opt/abao/
        │
        ▼
服务器 docker load + docker compose up -d
        │
        ▼
curl 健康检查
```

## 3. 改造方案

### 3.1 需要配置的 GitHub Secrets

在仓库 Settings → Secrets and variables → Actions 中添加：

#### Android 签名（APK 构建必需）

| Secret 名称 | 值 | 获取方式 |
|-------------|-----|---------|
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 Base64 | `base64 -i ~/abao-release-key.jks` |
| `ANDROID_KEY_ALIAS` | `abao` | key.properties 中的 keyAlias |
| `ANDROID_KEY_PASSWORD` | 你的密钥密码 | key.properties 中的 keyPassword |
| `ANDROID_STORE_PASSWORD` | 你的 keystore 密码 | key.properties 中的 storePassword |

#### 后端部署（自动部署必需）

| Secret 名称 | 值 | 获取方式 |
|-------------|-----|---------|
| `SERVER_HOST` | `118.196.78.215` | 服务器 IP |
| `SERVER_SSH_KEY` | SSH 私钥内容 | `cat ~/Documents/test.pem` |
| `DEPLOY_ENV_FILE` | `.env` 文件内容 | `cat .env` |

### 3.2 新 CI 工作流 (`ci.yml`)

保持现有结构，仅修复 Flutter 版本：

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    name: Backend Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_DB: abao_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: gradle
      - run: chmod +x server/gradlew
      - name: Run tests
        working-directory: server
        run: ./gradlew test
        env:
          SPRING_PROFILES_ACTIVE: test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: server/build/reports/tests/

  backend-build:
    name: Backend Build
    runs-on: ubuntu-latest
    needs: backend-test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: gradle
      - working-directory: server
        run: ./gradlew build -x test
      - uses: actions/upload-artifact@v4
        with:
          name: server-jar
          path: server/build/libs/*.jar

  frontend-test:
    name: Frontend Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.27.4'  # 与本地版本保持一致
          channel: 'stable'
          cache: true
      - working-directory: app
        run: flutter pub get
      - working-directory: app
        run: flutter analyze
      - working-directory: app
        run: flutter test
```

### 3.3 新 Deploy 工作流 (`deploy.yml`)

完全重写，替换 Railway 为 Docker 自建部署 + 签名 APK 构建：

```yaml
name: Deploy & Release

on:
  push:
    tags:
      - 'v*'

jobs:
  # ============================================
  # Job 1: 构建签名 Android APK
  # ============================================
  build-android:
    name: Build Android APK
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.27.4'
          channel: 'stable'
          cache: true

      - name: Install dependencies
        working-directory: app
        run: flutter pub get

      # 从 GitHub Secrets 还原 keystore 文件
      - name: Decode keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > app/android/app/release-keystore.jks

      # 生成 key.properties
      - name: Create key.properties
        run: |
          cat > app/android/key.properties << EOF
          storePassword=${{ secrets.ANDROID_STORE_PASSWORD }}
          keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}
          keyAlias=${{ secrets.ANDROID_KEY_ALIAS }}
          storeFile=release-keystore.jks
          EOF

      # 从 tag 提取版本号，如 v1.2.3 → versionName=1.2.3
      - name: Extract version from tag
        id: version
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          # 用 tag 的 patch 版本作为 versionCode（简单递增）
          # 例如 v1.0.3 → versionCode=10003
          IFS='.' read -r major minor patch <<< "$VERSION"
          CODE=$((major * 10000 + minor * 100 + patch))
          echo "code=$CODE" >> $GITHUB_OUTPUT

      - name: Build APK
        working-directory: app
        run: |
          flutter build apk --release \
            --build-name=${{ steps.version.outputs.version }} \
            --build-number=${{ steps.version.outputs.code }}

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-release-apk
          path: app/build/app/outputs/flutter-apk/app-release.apk

      # 创建 GitHub Release 并附带 APK
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: app/build/app/outputs/flutter-apk/app-release.apk
          generate_release_notes: true
          name: "A宝 ${{ steps.version.outputs.version }}"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # ============================================
  # Job 2: 部署后端到服务器
  # ============================================
  deploy-backend:
    name: Deploy Backend
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: gradle

      # 构建 Docker 镜像
      - name: Build Docker image
        run: docker build -t abao-server:latest server/

      - name: Save Docker image
        run: docker save abao-server:latest | gzip > /tmp/abao-server.tar.gz

      # 配置 SSH
      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SERVER_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.SERVER_HOST }} >> ~/.ssh/known_hosts

      # 上传镜像到服务器
      - name: Upload image to server
        run: |
          scp -i ~/.ssh/deploy_key \
            /tmp/abao-server.tar.gz \
            root@${{ secrets.SERVER_HOST }}:/opt/abao/

      # 上传 docker-compose 配置
      - name: Upload compose config
        run: |
          scp -i ~/.ssh/deploy_key \
            docker-compose.prod.yml \
            root@${{ secrets.SERVER_HOST }}:/opt/abao/

      # 上传 .env（从 Secret）
      - name: Upload .env
        run: |
          echo "${{ secrets.DEPLOY_ENV_FILE }}" > /tmp/.env
          scp -i ~/.ssh/deploy_key \
            /tmp/.env \
            root@${{ secrets.SERVER_HOST }}:/opt/abao/.env

      # 服务器重启
      - name: Deploy on server
        run: |
          ssh -i ~/.ssh/deploy_key root@${{ secrets.SERVER_HOST }} << 'DEPLOY'
            cd /opt/abao
            gunzip -c abao-server.tar.gz | docker load
            rm abao-server.tar.gz
            docker compose -f docker-compose.prod.yml up -d
            sleep 25
            curl -sf http://localhost:8080/api/health && echo '✅ 部署成功' || echo '❌ 部署失败'
          DEPLOY
```

## 4. 操作步骤

### 4.1 第一步：配置 Android 签名 Secrets

```bash
# 1. 将 keystore 文件转为 Base64
base64 -i ~/abao-release-key.jks | pbcopy
# 粘贴到 GitHub Secret: ANDROID_KEYSTORE_BASE64

# 2. 从 key.properties 获取其他值
cat app/android/key.properties
# 分别设置:
#   ANDROID_KEY_ALIAS     = abao
#   ANDROID_KEY_PASSWORD  = (你的密码)
#   ANDROID_STORE_PASSWORD = (你的密码)
```

### 4.2 第二步：配置服务器部署 Secrets

```bash
# 1. SSH 私钥
cat ~/Documents/test.pem | pbcopy
# 粘贴到 GitHub Secret: SERVER_SSH_KEY

# 2. 服务器地址
# 设置 SERVER_HOST = 118.196.78.215

# 3. 环境变量文件
cat .env | pbcopy
# 粘贴到 GitHub Secret: DEPLOY_ENV_FILE
```

### 4.3 第三步：替换 Workflow 文件

用上面第 3 节的内容替换：
- `.github/workflows/ci.yml` — 更新 Flutter 版本
- `.github/workflows/deploy.yml` — 完全重写

### 4.4 第四步：触发流水线

```bash
# CD 触发（打标签，格式: vMajor.Minor.MMDD.Build）
git tag v1.0.0215.1
git push origin v1.0.0215.1
```

### 4.5 第五步：下载 APK

打完标签后，在 GitHub 仓库 → Releases 页面即可下载签名 APK。

## 5. 发版流程

### 5.1 标准发版流程

```
开发完成
    │
    ▼
git add + commit           ← 自动触发 CI（测试+构建）
    │
    ▼
CI 通过？
    │── 否 → 修复后重新提交
    │
    ▼ 是
git tag v1.0.x             ← 自动触发 CD
    │
    ├──▶ 构建签名 APK → 上传到 GitHub Release
    │
    └──▶ 构建 Docker 镜像 → 部署到服务器
    │
    ▼
在 GitHub Releases 下载 APK → 分发给用户
```

### 5.2 版本号规范

```
v{Major}.{Minor}.{MMDD}.{Build}

Major: 主版本，重大架构变更
Minor: 小版本，功能迭代
MMDD:  日期（月日），标识发版日期
Build: 当日第几次构建

示例:
v1.0.0215.1  ← 1.0 版本，2月15日，第1次构建
v1.0.0215.2  ← 同一天修了个 bug，第2次构建
v1.1.0301.1  ← 1.1 版本，3月1日，第1次构建
v2.0.0501.1  ← 2.0 大版本
```

### 5.3 版本号 → Android versionCode 映射

公式：`Major * 100000000 + Minor * 1000000 + MMDD * 100 + Build`

| Tag | versionName | versionCode |
|-----|-------------|-------------|
| v1.0.0215.1 | 1.0.0215.1 | 100021501 |
| v1.0.0215.2 | 1.0.0215.2 | 100021502 |
| v1.1.0301.1 | 1.1.0301.1 | 101030101 |
| v2.0.0501.1 | 2.0.0501.1 | 200050101 |

> versionCode 单调递增即可，Android 用它判断新旧版本。上述公式保证日期越新、构建号越大，versionCode 越大。

## 6. APK 分发方案

### 6.1 GitHub Release 直接下载

最简单的方案，用户通过链接下载：

```
https://github.com/{owner}/{repo}/releases/latest/download/app-release.apk
```

### 6.2 可选增强：上传到自有服务器

如果需要更方便的分发（比如群聊里直接发链接），可在部署步骤后添加：

```yaml
      - name: Upload APK to server
        run: |
          scp -i ~/.ssh/deploy_key \
            app/build/app/outputs/flutter-apk/app-release.apk \
            root@${{ secrets.SERVER_HOST }}:/var/www/download/abao-latest.apk
```

然后用户访问 `https://yourdomain.com/download/abao-latest.apk` 即可下载。

## 7. 费用估算

| 项目 | 费用 | 说明 |
|------|------|------|
| GitHub Actions | **免费** | 公开仓库无限制，私有仓库 2000 分钟/月 |
| 额外服务器 | **不需要** | 复用现有 118.196.78.215 |
| Android 签名证书 | **免费** | keytool 自行生成 |
| Google Play 上架 | $25（一次性）| 当前不需要，APK 直接分发 |

**总结：零额外成本。**

## 8. 安全注意事项

- **Keystore 文件** 仅通过 GitHub Secrets 存储，不入库
- **SSH 私钥** 仅通过 GitHub Secrets 传递，用完即删
- **.env 文件** 包含 API Key，仅通过 Secrets 管理
- GitHub Actions 日志**不会**打印 Secrets 值（自动脱敏）
- 建议为 CI/CD 创建专用 SSH Key，不复用个人密钥（后续优化）

## 9. 故障排查

### 9.1 APK 构建失败

| 症状 | 原因 | 解决 |
|------|------|------|
| `Keystore not found` | ANDROID_KEYSTORE_BASE64 未设置或解码失败 | 重新 base64 编码上传 |
| `Gradle build failed` | 依赖下载超时 | 重试或添加国内镜像 |
| `flutter pub get` 失败 | Flutter 版本不匹配 | 检查 workflow 中的版本号 |

### 9.2 后端部署失败

| 症状 | 原因 | 解决 |
|------|------|------|
| `SSH connection refused` | SSH Key 不正确 | 检查 SERVER_SSH_KEY 格式 |
| `docker load` 失败 | 镜像文件损坏 | 重新触发部署 |
| 健康检查失败 | 应用启动慢或配置错误 | SSH 到服务器查看 `docker logs abao-server` |

## 10. 后续优化（可选）

| 优化项 | 优先级 | 说明 |
|--------|-------|------|
| 创建专用部署 SSH Key | 中 | 安全隔离，不复用个人密钥 |
| 添加 Telegram/飞书通知 | 低 | 部署成功/失败自动通知 |
| iOS 构建工作流 | 低 | 需要 macOS Runner + Apple 证书 |
| 自动化 E2E 测试 | 低 | 部署后自动跑 Playwright 测试 |
| 灰度发布 | 低 | 内部测试 → 全量发布 |
