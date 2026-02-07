# Repository Guidelines（仓库指南）

## 项目结构与模块组织
- `app/` 为 Flutter 客户端。核心代码位于 `app/lib/`，按职责划分为 `models`、`providers`、`services`、`screens`、`widgets`；前端测试在 `app/test/`。
- `server/` 为 Spring Boot 后端。主要代码位于 `server/src/main/java/com/abao/`，包含 `controller`、`service`、`repository`、`entity`、`dto`、`security`、`websocket` 等分层。
- 后端配置与 SQL 初始化脚本位于 `server/src/main/resources/`；后端测试位于 `server/src/test/java/com/abao/`。
- `doc/` 存放产品、设计与开发文档；`.github/workflows/` 定义 CI/CD，需与本地命令保持一致。

## 构建、测试与开发命令
- `cp .env.example .env`：初始化本地环境变量。
- `docker compose -f docker-compose.dev.yml up -d postgres redis`：启动本地数据库与缓存依赖。
- `cd server && ./gradlew bootRun`：本地启动后端（默认端口 `8080`）。
- `cd server && ./gradlew test`：运行后端单元/集成测试。
- `cd app && flutter pub get`：安装 Flutter 依赖。
- `cd app && flutter run`：在模拟器、真机或 Web 运行客户端。
- `cd app && flutter analyze && flutter test`：执行静态检查与前端测试。
- 可选脚本：`cd server/scripts && ./api_test.sh`、`cd app && ./scripts/run_all_tests.sh`。

## 代码风格与命名规范
- Dart 遵循 `flutter_lints` 与 `app/analysis_options.yaml`（如 `prefer_const_constructors`、`avoid_print`、`prefer_single_quotes`），使用 2 空格缩进。
- Java 遵循 Spring 常规风格，使用 4 空格缩进，包名前缀保持 `com.abao`。
- 类名使用 `PascalCase`，方法与变量使用 `camelCase`，常量使用 `UPPER_SNAKE_CASE`。
- DTO 命名保持语义清晰（例如 `LoginRequest`、`TokenResponse`），并放在对应分层目录。

## 测试规范
- 前端测试栈：`flutter_test`、`test`、`mockito`、`mocktail`；测试文件以 `_test.dart` 结尾。
- 后端测试栈：Spring Boot Test + JUnit 5；测试文件以 `*Test.java` 结尾，接口级场景放在 `integration/`。
- 每个功能或修复都应补充/更新测试；提交 PR 前确保前后端测试全部通过。

## 提交与 Pull Request 规范
- 延续现有提交前缀：`feat:`、`fix:`、`test:`、`docs:`。
- 保持单次提交聚焦且尽量小粒度。
- PR 需包含简要变更说明、影响模块、测试证据（日志或 UI 截图）以及关联任务/Issue。
- 严禁提交 `.env` 中的密钥；新增环境变量需同步更新 `.env.example`。
