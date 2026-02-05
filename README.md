# A宝 - AI群聊应用

> 让每群人都能AI聊天

## 项目结构

```
ai_chat/
├── server/          # Spring Boot 后端
├── app/             # Flutter 移动端
├── doc/             # 文档
└── README.md
```

## 技术栈

- **后端**: Spring Boot 3.x + WebSocket + PostgreSQL
- **前端**: Flutter 3.x
- **数据库**: Supabase (PostgreSQL)
- **缓存**: Caffeine + Upstash Redis
- **AI**: DeepSeek API
- **邮箱**: Resend
- **部署**: Docker + Railway

## 开发环境要求

### 后端 (server/)
- Java 17+
- Gradle 8.5+

### 前端 (app/)
- Flutter 3.x
- Dart 3.2+
- Android SDK (Android 开发)
- Xcode (iOS 开发)

## 快速开始

### 1. 克隆项目

```bash
git clone <repo-url>
cd ai_chat
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入必要的配置
```

### 3. 启动后端

```bash
cd server
./gradlew bootRun
```

### 4. 启动前端

```bash
cd app
flutter pub get
flutter run
```

## 文档

- [需求文档](doc/RequirementsDoc.md)
- [PRD](doc/PRD.md)
- [功能摘要](doc/FeatureSummary.md)
- [开发计划](doc/DevelopmentPlan.md)
- [UI设计](doc/UIDesign.md)
- [任务列表](doc/tasks.md)

## License

MIT
