# 前端测试规范

本文档为 Flutter 应用（代号 `abao_app`）提供了一套统一的测试策略，旨在提升代码质量、用户体验和应用稳定性。

## 一、现有测试体系

根据对 `pubspec.yaml` 和 `test` 目录的分析，当前前端的测试体系如下：

### 1. 技术栈

- **核心测试框架**: `flutter_test` (由 Flutter SDK 提供)
- **单元测试包**: `test`
- **Mocking框架**: 同时存在 `mockito` 和 `mocktail`。`http_mock_adapter` 用于模拟 HTTP 请求。
- **代码生成**: `build_runner` (通常与 `mockito` 配合使用)。

### 2. 测试分类

- **单元测试 (Unit Tests)**: 在 `test` 目录下，针对 `models`, `providers`, `services` 等独立的逻辑单元编写。
- **组件测试 (Widget Tests)**: 存在 `widget_test.dart`，用于测试独立的 Flutter 组件（Widget）的渲染和交互。
- **集成测试 (Integration Tests)**: 在 `test/integration` 目录下，用于测试跨越多个组件或服务协同工作的场景。

### 3. 问题与改进点

- **Mocking 库不统一**: 同时使用 `mockito` 和 `mocktail` 增加了认知成本和维护复杂性。
- **测试结构可以更清晰**: 测试文件的组织可以更系统化，以更好地反映测试金字塔的层次。

---

## 二、未来演进：构建高效的移动端测试金字塔

我们将采用测试金字塔模型，并结合 Flutter 的特性，构建一个分层清晰、自动化程度高的测试体系。

### 1. 测试金字塔模型

- **单元测试 (60%)**: 金字塔的基础。这些测试不依赖 Flutter UI 框架，在纯 Dart 环境中快速运行，验证业务逻辑、数据模型和状态管理的正确性。
- **组件测试 (30%)**: 金字塔的中间层。Flutter 的一大优势就是强大的组件测试能力。这类测试用于验证单个 Widget 的 UI 渲染、交互和响应是否符合预期。
- **端到端测试 (E2E Tests) (10%)**: 金字塔的顶层。模拟真实用户在设备上的完整操作流程，确保应用的端到端功能正确无误。

### 2. 未来技术栈与策略

#### a. 单元测试 (Unit Tests)

- **目标**: 快速、稳定地验证核心业务逻辑。
- **策略**:
    - **统一 Mocking 框架**: 全面转向 **`mocktail`**。
        - **优势**: `mocktail` 提供了更简洁的 API，无需代码生成（`build_runner`），减少了项目配置的复杂性，提升了开发效率。
        - **迁移计划**: 新增测试统一使用 `mocktail`，并逐步将现有的 `mockito` 测试迁移过来。
    - **测试范围**:
        - **Services/Repositories**: 模拟 `dio` 或其他网络客户端，测试数据解析、错误处理和状态转换。
        - **Providers/Blocs/Controllers**: 测试状态管理逻辑，确保在不同事件（Event）或用户操作下，状态（State）能正确地更新。
        - **Models**: 测试数据模型的序列化/反序列化（`fromJson`/`toJson`）和内部逻辑。

#### b. 组件测试 (Widget Tests)

- **目标**: 确保每个 Widget 的 UI 表现和交互逻辑正确。
- **策略**:
    - **遵循“Arrange-Act-Assert”模式**:
        - **Arrange**: 使用 `tester.pumpWidget()` 渲染待测试的 Widget，并准备好 Mock 的服务或 Provider。
        - **Act**: 使用 `tester.tap()`, `tester.enterText()` 等模拟用户交互。
        - **Assert**: 使用 `find` 和 `expect` 验证 Widget 的状态和 UI 是否按预期变化。
    - **独立测试**: 每个测试应专注于一个独立的 Widget，其依赖的子组件或服务应通过 Mock 提供，避免测试范围无限扩大。
    - **覆盖视觉状态**: 测试 Widget 在不同状态（如加载中、加载成功、加载失败）下的 UI 表现。

#### c. 端到端测试 (E2E Tests)

- **目标**: 验证真实设备或模拟器上的完整用户流程。
- **策略**:
    - **引入 `patrol` 框架**: 使用 `patrol` 替代 `integration_test`。
        - **优势**: `patrol` 是在 `integration_test` 基础上的增强，提供了更丰富的 API 来处理原生 UI 元素（如权限对话框、系统通知），并提供了更好的可读性和强大的选择器。
        - **官方支持**: 由 LeanCode (知名的 Flutter 咨询公司) 开发和维护，社区活跃。
    - **测试场景**:
        - 创建独立的 `e2e` 或 `patrol` 目录来存放测试。
        - 编写关键业务流程脚本，例如：
            1. 应用启动 -> 自动登录流程
            2. 用户登录 -> 进入主界面
            3. 选择群组 -> 查看聊天记录
            4. 输入消息 -> 发送 -> 验证消息出现在列表中 -> 验证AI回复
            5. 进入设置 -> 修改主题 -> 验证主题生效
    - **测试设备**: 在 CI/CD 环境中，使用模拟器或云真机服务（如 Firebase Test Lab）来运行 E2E 测试。

### 3. CI/CD 集成

- **持续集成 (CI)**:
    - **Pull Request 触发**: 自动运行所有 **单元测试** 和 **组件测试**。
    - **代码风格检查**: 运行 `flutter analyze` 确保代码质量。
    - **测试覆盖率**: 集成 `lcov` 等工具，生成测试覆盖率报告，并设定一个最低覆盖率阈值（例如 80%）。
- **持续部署 (CD)**:
    - **部署到内部测试轨道后触发**: 在构建并部署到 Firebase App Distribution 或 TestFlight 后，自动在云测试平台上触发 **E2E (Patrol) 测试**。
    - **发布到应用商店**: 只有当所有 E2E 测试通过后，才允许将应用发布到 Google Play Store 或 Apple App Store。

通过这套现代化的测试体系，我们可以确保 `abao_app` 在快速迭代的同时，始终保持高质量和高稳定性，为用户提供流畅可靠的体验。
