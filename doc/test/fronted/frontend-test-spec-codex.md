# 前端测试规范与体系化方案（codex）

> 适用范围：`app/`（Flutter 客户端）
>
> 文档目标：先沉淀当前项目里**已经存在且可执行**的测试规范，再给出可落地的“体系化测试基建”升级方案。

---

## 1. 当前已存在的测试规范（基于仓库现状）

### 1.1 测试技术栈

- 测试框架：`flutter_test`、`test`
- Mock 工具：`mockito`、`mocktail`
- 网络层：`dio`（部分测试通过 fake adapter 或 mock）
- 质量检查：`flutter analyze`

来源文件：

- `app/pubspec.yaml`
- `.github/workflows/ci.yml`

### 1.2 测试目录与分层现状

当前测试按功能目录组织，已形成基础分层：

- `app/test/models/`：模型序列化/字段逻辑（纯 Dart）
- `app/test/services/`：服务层与拦截器、Token 管理
- `app/test/providers/`：状态管理与业务编排
- `app/test/screens/auth/`：页面相关纯逻辑（自动登录参数解析）
- `app/test/integration/`：对本地后端 API 的集成测试
- `app/test/widget_test.dart`：启动页基础 Widget 测试

命名规范：`*_test.dart`（已遵循）。

### 1.3 当前测试规模（按 `test/testWidgets` 统计）

主要文件测试数：

- `providers/chat_provider_test.dart`：63
- `providers/auth_provider_test.dart`：18
- `screens/auth/auto_login_parse_test.dart`：14
- `services/token_manager_test.dart`：10
- `services/auth_service_test.dart`：10
- `models/message_test.dart`：11
- `integration/api_integration_test.dart`：6
- `widget_test.dart`：1

按模块聚合：

- `providers`：81
- `services`：25
- `models`：22
- `screens`：14
- `integration`：6
- `widget`：1

### 1.4 当前执行方式

- 本地推荐命令（已存在）：
  - `cd app && dart test test/models/`
  - `cd app && flutter test`
  - `cd app && flutter analyze`
- 脚本：
  - `app/test/run_tests.sh`：模型 + 单个 widget（含代理开关逻辑）
  - `app/scripts/run_all_tests.sh`：当前仅覆盖 model 测试
  - `app/scripts/dual_test.sh`：双账号手工联调脚本（偏手工验证）
- CI：
  - `flutter pub get`
  - `flutter analyze`
  - `flutter test`

### 1.5 当前已形成的测试设计实践

- 普遍使用 `group + test` 进行行为组织，命名可读性较好。
- 模型层对 `fromJson/toJson/copyWith/getter` 覆盖较完整。
- `ChatProvider`、`TokenManager`、`ApiService.installInterceptors` 已具备注入点（`forTest`/静态安装）并可做高质量行为测试。
- 使用 `Mocktail` + fallback value 的方式较统一。

---

## 2. 当前主要缺口（未形成体系的地方）

### 2.1 存在“占位测试”，有效断言不足

以下文件含 `expect(true, true)` 占位断言：

- `app/test/services/auth_service_test.dart`（多处）
- `app/test/providers/auth_provider_test.dart`（多处）

这类用例能通过，但不能守护真实业务行为。

### 2.2 可测性不一致

- `AuthService` 仍直接 new `ApiService` 和 `FlutterSecureStorage`，导致单测难以替换依赖。
- 一部分模块（如 `ChatProvider`、`TokenManager`）已有依赖注入；另一部分没有，风格不统一。

### 2.3 测试层级断层

- Widget 测试仅 1 个基础启动用例，UI 关键路径未被系统化覆盖。
- 缺少 Golden / 视觉回归。
- integration 测试里有 `skip`（依赖手工邮箱验证），自动化价值受限。

### 2.4 工程化缺口

- 目前无覆盖率门禁（只提供手工生成覆盖率方式）。
- 脚本与 CI 口径不完全一致（部分脚本只跑子集）。
- 未建立统一测试标签（unit/widget/integration/e2e）和分层执行策略。

---

## 3. 前端未来“体系化高基建”测试规范（目标方案）

## 3.1 分层测试金字塔（统一标准）

- **L1 单元测试（必选）**：纯 Dart 逻辑、Provider 状态机、Service 业务分支。
- **L2 组件测试（必选）**：关键 Widget 交互、错误态、空态、加载态。
- **L3 集成测试（必选）**：登录、建群、入群、发消息、@AI、回复链路。
- **L4 端到端冒烟（建议）**：Web/移动端真实环境最小闭环验证。

原则：新增功能默认至少覆盖 `L1 + L2`；跨模块流程必须补 `L3`。

### 3.2 可测性编码规范（强制）

- Service/Provider 必须支持构造注入（API、Storage、Clock、WebSocket、UUID）。
- 禁止新增无法替换的硬依赖单例调用（除非有明确适配层）。
- 异步逻辑需可控（可注入 `Duration/Timer` 或抽象 scheduler）。
- 测试中禁止 `expect(true, true)`、空断言、无行为验证测试。

### 3.3 用例命名与组织规范

- 命名使用“场景 + 期望结果”风格：`should_xxx_when_yyy` 或中文等价句式。
- 按 Arrange / Act / Assert 三段组织，不写无意义注释。
- 每个 `group` 对应一个职责边界，不跨模块混写。

### 3.4 Mock 与测试数据规范

- 建立统一测试夹具目录：`app/test/fixtures/`、`app/test/builders/`。
- DTO/Model 使用 builder 工厂，减少重复 JSON 粘贴。
- 网络行为优先 mock API boundary，不 mock 被测对象内部细节。
- 时钟、ID、时间戳统一可控，避免 `DateTime.now()` 引发随机失败。

### 3.5 CI 门禁规范（建议作为 PR 必过项）

- PR 必跑：
  - `flutter analyze`
  - `flutter test --coverage`
- 覆盖率阈值（分阶段执行）：
  - 阶段 A：全局 line >= 60%
  - 阶段 B：全局 line >= 70%，核心目录（`providers/services`）>= 80%
- 失败即阻塞合并；保留覆盖率产物（lcov/html）供审查。

### 3.6 稳定性与效率规范

- 对易波动用例加 `retry` 策略前，先修复根因（时间、网络、异步竞态）。
- 建立 `test tags`：`unit`、`widget`、`integration`、`e2e`。
- CI 采用“快速集（PR）+ 全量集（nightly）”双轨。

---

## 4. 前端落地路线图（建议）

### M1（1 周）：补齐基础可测性

- 为 `AuthService`、相关 Provider 完成依赖注入改造。
- 清零占位测试（替换真实断言）。
- 脚本统一到 `flutter analyze + flutter test`。

### M2（1~2 周）：建立标准化测试资产

- 增加 fixtures/builders。
- 引入关键页面 Widget 用例（登录、群聊列表、消息发送态）。
- 建立至少 1 条稳定 integration happy-path。

### M3（2 周）：质量门禁上线

- CI 接入覆盖率阈值与报告归档。
- 增加 anti-pattern 检查（占位测试、skip 白名单）。
- 形成 PR 模板中的测试变更清单。

### M4（持续）：高阶基建

- Golden 回归（关键组件）。
- 端到端稳定性回归（Web 双账号 + API mock/真实后端分层）。

---

## 5. 前端“Definition of Done（测试维度）”建议

- 新功能必须包含至少 1 个单元测试。
- 状态流转/错误处理必须有失败分支测试。
- UI 交互改动必须补充 Widget 或 Golden（二选一，核心页面建议都做）。
- 跨模块流程改动必须补充 Integration 冒烟。
- PR 描述必须附：测试命令、结果摘要、未覆盖风险说明。

