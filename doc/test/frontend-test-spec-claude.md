# A宝 前端测试规范

> 最后更新: 2026-02-06 | 维护者: Claude

---

## 第一部分：现状盘点

### 1.1 测试文件清单

| 文件 | 类型 | 框架 | 用例数 | 说明 |
|------|------|------|--------|------|
| `models/user_test.dart` | Model | package:test | 6 | fromJson/toJson、displayName |
| `models/group_test.dart` | Model | package:test | 5 | 序列化、默认值、copyWith |
| `models/message_test.dart` | Model | package:test | 11 | 消息类型解析、回复信息、便捷 getter |
| `services/token_manager_test.dart` | Service | package:test + mocktail | 10 | JWT 校验、刷新去重、会话过期流 |
| `services/auth_service_test.dart` | Service | package:test + mocktail | 10 | 登录/注册/登出（多为占位测试） |
| `services/api_service_interceptor_test.dart` | Service | package:test + mocktail + dio | 5 | 401 自动刷新重试、端点豁免 |
| `providers/auth_provider_test.dart` | Provider | package:test + mocktail | 18 | 初始状态、会话过期、dispose |
| `providers/chat_provider_test.dart` | Provider | package:test + mocktail | 63 | 消息发送/接收/去重、群组 CRUD、WebSocket |
| `screens/auth/auto_login_parse_test.dart` | Utility | package:test | 14 | 邮箱密码解析、URI 提取 |
| `widget_test.dart` | Widget | flutter_test | 1 | SplashScreen 基本渲染 |
| `integration/api_integration_test.dart` | 集成 | package:test + dio | 6 | Health、注册、登录 API |

**合计：11 个测试文件，149 个用例**

### 1.2 技术栈

| 工具 | 用途 |
|------|------|
| `package:test` | 纯 Dart 测试（Model、工具类） |
| `flutter_test` | Widget 测试 |
| `mocktail` | 主力 Mock 框架（手写 Mock） |
| `mockito` | 已引入但未大量使用 |
| `dio` | HTTP Mock（api_service_interceptor_test） |
| `http_mock_adapter` | 已引入但未使用 |

### 1.3 现有模式

**依赖注入测试**：通过 `.forTest()` 工厂方法注入 Mock

```dart
// 实际使用模式
final provider = ChatProvider.forTest(api: mockApi, ws: mockWs);
final tokenMgr = TokenManager.forTest(dio: mockDio, storage: mockStorage);
final authProv = AuthProvider.forTest(authService: mock, tokenManager: mock);
```

**Mock 集中管理**：`test/mocks/mock_services.dart`

```dart
class MockDio extends Mock implements Dio {}
class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}
class MockApiService extends Mock implements ApiService {}
class MockAuthService extends Mock implements AuthService {}
class MockTokenManager extends Mock implements TokenManager {}
class MockWebSocketService extends Mock implements WebSocketService {}
```

**JWT 测试辅助**：token_manager_test 中有 `_makeToken()` 系列工具函数

**WebSocket 测试**：chat_provider_test 中通过捕获 handler 回调模拟 WebSocket 事件

### 1.4 现有不足

| 问题 | 影响 |
|------|------|
| auth_service_test 多数为 `expect(true, true)` 占位 | 无实际覆盖 |
| Widget 测试仅 1 个 | 所有页面无 UI 测试 |
| 无 Golden 测试 | UI 回归无法自动检测 |
| 无覆盖率检查 | 不知道覆盖到哪了 |
| E2E 全手动 | dual_test.sh 需人肉观察 |
| 系统代理干扰 flutter test | 开发体验差 |
| http_mock_adapter 引入了没用 | 依赖冗余 |
| Model 测试用 dart test，Provider 用 flutter test | 运行命令不统一 |

---

## 第二部分：目标测试规范

### 2.1 测试金字塔

```
        ╱  E2E (Playwright / dual_test.sh)   ╲     ← 核心场景：注册→建群→发消息→AI 回复
       ╱    Widget 测试 (flutter_test)          ╲    ← 每个页面 1 个
      ╱      Provider/Service 单元测试            ╲   ← 核心业务逻辑
     ╱        Model / 纯 Dart 工具测试              ╲  ← 最多最快
```

**比例目标**：纯 Dart 40% | Provider/Service 35% | Widget 20% | E2E 5%

### 2.2 目录结构规范

```
app/test/
├── models/                          # 纯 Dart Model 测试
│   ├── user_test.dart               ✅ 已有
│   ├── group_test.dart              ✅ 已有
│   └── message_test.dart            ✅ 已有
├── services/                        # Service 层单元测试
│   ├── token_manager_test.dart      ✅ 已有
│   ├── auth_service_test.dart       ⚠️ 需重写（去掉占位）
│   ├── api_service_test.dart        ← 待建
│   ├── api_service_interceptor_test.dart  ✅ 已有
│   └── websocket_service_test.dart  ← 待建
├── providers/                       # 状态管理测试
│   ├── auth_provider_test.dart      ✅ 已有
│   └── chat_provider_test.dart      ✅ 已有
├── screens/                         # Widget / 页面测试
│   ├── auth/
│   │   ├── auto_login_parse_test.dart  ✅ 已有
│   │   ├── login_screen_test.dart      ← 待建
│   │   └── register_screen_test.dart   ← 待建
│   ├── chat/
│   │   └── chat_screen_test.dart       ← 待建
│   ├── group/
│   │   ├── create_group_test.dart      ← 待建
│   │   └── join_group_test.dart        ← 待建
│   └── home/
│       └── home_screen_test.dart       ← 待建
├── utils/                           # 工具类测试
│   └── formatters_test.dart         ← 按需
├── integration/                     # API 集成测试
│   └── api_integration_test.dart    ✅ 已有
├── mocks/                           # Mock 集中管理
│   └── mock_services.dart           ✅ 已有
├── helpers/                         # 测试辅助工具
│   ├── test_app.dart                ← 待建：Widget 测试脚手架
│   └── pump_app.dart                ← 待建：快速包装 MaterialApp
└── widget_test.dart                 ✅ 已有
```

### 2.3 命名规范

**测试文件**：`{被测文件名}_test.dart`

**测试组**（group）：用被测方法或场景命名

**测试用例**：`should 期望行为 when 前置条件`

```dart
// Good
group('sendMessage', () {
  test('should send message when content is not empty', () { });
  test('should throw when group not found', () { });
  test('should deduplicate when same message received twice', () { });
});

// Bad (现有的，需逐步迁移)
test('initial state', () { });
test('send message success', () { });
```

### 2.4 测试分层规范

#### 2.4.1 Model 测试（纯 Dart）

```dart
// 使用 package:test，可用 dart test 快速运行
import 'package:test/test.dart';

void main() {
  group('User.fromJson', () {
    test('should parse all required fields', () {
      final json = {'id': 1, 'email': 'a@b.com', 'nickname': 'test'};
      final user = User.fromJson(json);
      expect(user.id, 1);
      expect(user.email, 'a@b.com');
    });

    test('should handle null optional fields', () {
      final json = {'id': 1, 'email': 'a@b.com'};
      final user = User.fromJson(json);
      expect(user.avatar, isNull);
    });

    test('should handle null datetime gracefully', () {
      final json = {'id': 1, 'email': 'a@b.com', 'createdAt': null};
      // 不应抛异常
      expect(() => User.fromJson(json), returnsNormally);
    });
  });

  group('User.toJson', () {
    test('should produce valid json roundtrip', () {
      final user = User(id: 1, email: 'a@b.com', nickname: 'test');
      final json = user.toJson();
      final restored = User.fromJson(json);
      expect(restored.email, user.email);
    });
  });
}
```

**规则**：
- 用 `package:test` 不用 `flutter_test`（可绕过代理问题）
- 必测：fromJson、toJson、null 兜底、convenience getter
- 运行：`dart test test/models/`

#### 2.4.2 Service 测试

```dart
import 'package:test/test.dart';
import 'package:mocktail/mocktail.dart';

void main() {
  late MockDio mockDio;
  late MockFlutterSecureStorage mockStorage;
  late TokenManager tokenManager;

  setUp(() {
    mockDio = MockDio();
    mockStorage = MockFlutterSecureStorage();
    tokenManager = TokenManager.forTest(dio: mockDio, storage: mockStorage);
  });

  group('validateToken', () {
    test('should return true when token not expired', () {
      expect(tokenManager.isTokenValid(validToken()), isTrue);
    });

    test('should return false when token within 30s buffer', () {
      expect(tokenManager.isTokenValid(almostExpiredToken()), isFalse);
    });
  });
}
```

**规则**：
- 所有外部依赖用 `mocktail` Mock
- Service 必须提供 `.forTest()` 构造函数
- 用 `setUp()` 初始化，每个 test 独立
- 异步测试用 `async/await`，不用 `.then()`

#### 2.4.3 Provider 测试

```dart
import 'package:test/test.dart';
import 'package:mocktail/mocktail.dart';

void main() {
  late MockApiService mockApi;
  late MockWebSocketService mockWs;
  late ChatProvider provider;

  setUp(() {
    mockApi = MockApiService();
    mockWs = MockWebSocketService();
    provider = ChatProvider.forTest(api: mockApi, ws: mockWs);
  });

  tearDown(() {
    provider.dispose();
  });

  group('sendMessage', () {
    test('should call api.post with correct params', () async {
      when(() => mockApi.post(any(), data: any(named: 'data')))
          .thenAnswer((_) async => {'id': 1, 'content': 'hello'});

      await provider.sendMessage('hello');

      verify(() => mockApi.post('/api/messages', data: any(named: 'data'))).called(1);
    });

    test('should add message to local list optimistically', () async {
      when(() => mockApi.post(any(), data: any(named: 'data')))
          .thenAnswer((_) async => {'id': 1, 'content': 'hello'});

      await provider.sendMessage('hello');

      expect(provider.messages.last.content, 'hello');
    });
  });
}
```

**规则**：
- Provider 必须提供 `.forTest()` 构造函数
- `tearDown()` 中调用 `dispose()`
- 测试 `notifyListeners` 是否触发：用 `provider.addListener(callback)`
- WebSocket 测试：捕获 handler 回调，手动调用模拟事件

#### 2.4.4 Widget 测试

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';

void main() {
  late MockAuthProvider mockAuth;

  setUp(() {
    mockAuth = MockAuthProvider();
    when(() => mockAuth.status).thenReturn(AuthStatus.unauthenticated);
  });

  Widget buildApp(Widget child) {
    return MaterialApp(
      home: ChangeNotifierProvider<AuthProvider>.value(
        value: mockAuth,
        child: child,
      ),
    );
  }

  group('LoginScreen', () {
    testWidgets('should show email and password fields', (tester) async {
      await tester.pumpWidget(buildApp(const LoginScreen()));
      expect(find.byType(TextField), findsNWidgets(2));
    });

    testWidgets('should show error when email empty', (tester) async {
      await tester.pumpWidget(buildApp(const LoginScreen()));
      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();
      expect(find.text('Email is required'), findsOneWidget);
    });

    testWidgets('should call login on valid submit', (tester) async {
      when(() => mockAuth.login(any(), any())).thenAnswer((_) async => true);

      await tester.pumpWidget(buildApp(const LoginScreen()));
      await tester.enterText(find.byKey(Key('email')), 'a@b.com');
      await tester.enterText(find.byKey(Key('password')), 'Pass123');
      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();

      verify(() => mockAuth.login('a@b.com', 'Pass123')).called(1);
    });
  });
}
```

**规则**：
- 用 `testWidgets`，不用 `test`
- 提供 `buildApp()` 辅助方法包装 MaterialApp + Provider
- 测试：渲染、交互、表单校验、导航
- Widget Key：关键交互元素必须加 `Key('xxx')` 方便测试查找
- 用 `pumpAndSettle()` 等待动画完成

#### 2.4.5 集成测试（API）

```dart
// 需要后端运行
@TestOn('vm')
void main() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));

  group('Auth API', () {
    test('should register new user', () async {
      final resp = await dio.post('/api/auth/register', data: {
        'email': 'test_${DateTime.now().millisecondsSinceEpoch}@test.com',
        'password': 'Test123456',
        'nickname': 'Tester',
      });
      expect(resp.statusCode, 200);
    });
  }, skip: 'Requires backend running');
}
```

**规则**：
- 默认 `skip`，手动 / CI 指定运行
- 用唯一时间戳避免数据冲突
- 运行前确保后端 Docker 启动

### 2.5 Mock 管理规范

**集中定义**：`test/mocks/mock_services.dart`

```dart
import 'package:mocktail/mocktail.dart';

// HTTP
class MockDio extends Mock implements Dio {}

// Storage
class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

// Services
class MockApiService extends Mock implements ApiService {}
class MockAuthService extends Mock implements AuthService {}
class MockTokenManager extends Mock implements TokenManager {}
class MockWebSocketService extends Mock implements WebSocketService {}

// Providers (for Widget tests)
class MockAuthProvider extends Mock implements AuthProvider {}
class MockChatProvider extends Mock implements ChatProvider {}

// Fallback values (mocktail 需要)
void registerFallbacks() {
  registerFallbackValue(FakeRequestOptions());
  registerFallbackValue(FakeUri());
}

class FakeRequestOptions extends Fake implements RequestOptions {}
class FakeUri extends Fake implements Uri {}
```

**规则**：
- 新建 Mock 统一放 `mock_services.dart`
- Fallback values 在 `setUpAll` 中注册
- 优先用 `mocktail`（无代码生成），`mockito` 仅在需要 `@GenerateMocks` 时用

### 2.6 Widget 测试脚手架

```dart
// test/helpers/pump_app.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

extension PumpApp on WidgetTester {
  Future<void> pumpApp(
    Widget widget, {
    AuthProvider? authProvider,
    ChatProvider? chatProvider,
  }) {
    return pumpWidget(
      MultiProvider(
        providers: [
          if (authProvider != null)
            ChangeNotifierProvider.value(value: authProvider),
          if (chatProvider != null)
            ChangeNotifierProvider.value(value: chatProvider),
        ],
        child: MaterialApp(home: widget),
      ),
    );
  }
}
```

### 2.7 覆盖率要求

| 指标 | 目标 |
|------|------|
| Model 层 | >= 90% |
| Provider 层 | >= 80% |
| Service 层 | >= 70% |
| Widget 层 | 关键页面 >= 60% |
| 整体 | >= 70% |

**运行覆盖率**：

```bash
# 生成覆盖率数据
flutter test --coverage

# 生成 HTML 报告（需安装 lcov）
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html

# 或用 Dart 工具
dart pub global activate coverage
dart pub global run coverage:format_coverage \
  --lcov --in=coverage --out=coverage/lcov.info --packages=.dart_tool/package_config.json
```

### 2.8 代理问题解决方案（macOS 特有）

```bash
# 方案 A：临时关代理跑测试
networksetup -setwebproxystate "Wi-Fi" off
networksetup -setsecurewebproxystate "Wi-Fi" off
networksetup -setsocksfirewallproxystate "Wi-Fi" off
flutter test
# 跑完恢复
networksetup -setwebproxystate "Wi-Fi" on
networksetup -setsecurewebproxystate "Wi-Fi" on
networksetup -setsocksfirewallproxystate "Wi-Fi" on

# 方案 B：纯 Dart Model 测试（不受代理影响）
dart test test/models/

# 方案 C：alias 一键测试
alias ftest="unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY && flutter test"
```

### 2.9 CI 集成

```yaml
# .github/workflows/ci.yml (前端部分)
frontend-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: subosito/flutter-action@v2
      with:
        flutter-version: '3.19.0'
        channel: 'stable'
        cache: true
    - name: Install dependencies
      run: cd app && flutter pub get
    - name: Analyze
      run: cd app && flutter analyze
    - name: Run tests with coverage
      run: cd app && flutter test --coverage
    - name: Check coverage threshold
      run: |
        COVERAGE=$(lcov --summary app/coverage/lcov.info 2>&1 | grep "lines" | awk '{print $2}' | sed 's/%//')
        if (( $(echo "$COVERAGE < 70" | bc -l) )); then
          echo "Coverage $COVERAGE% is below 70% threshold"
          exit 1
        fi
    - name: Upload coverage
      uses: actions/upload-artifact@v4
      with:
        name: frontend-coverage
        path: app/coverage/
```

### 2.10 E2E 测试规范

#### 方式一：手动双账号脚本

```bash
cd app/scripts && ./dual_test.sh
```

- 两个 Chrome Profile 隔离 localStorage
- auto_login URL 自动填充凭据
- 适合快速人肉验证多人聊天

#### 方式二：Playwright（Flutter Web）

**关键约束**（CanvasKit 渲染模式）：
1. Playwright snapshot 看不到 Canvas 内容 → 用 Semantics 树
2. 文本输入不能直接 fill → 先 focus 再 keyboard.type
3. 节点 ID 不稳定 → 用 role + 位置查找
4. 静态部署不走 WebSocket → 消息轮询 / 手动刷新

**推荐流程**：
```bash
# 1. 后端
docker-compose -f docker-compose.dev.yml up -d
# 2. 构建 Flutter Web
cd app && flutter build web --release
# 3. 静态服务
cd build/web && python3 -m http.server 9191 &
# 4. Playwright 自动化
# 通过 MCP Playwright 工具操作
```

### 2.11 待建设清单（按优先级）

| 优先级 | 任务 | 预估用例数 |
|--------|------|-----------|
| P0 | 重写 auth_service_test（去掉占位） | ~10 |
| P0 | 创建 test/helpers/pump_app.dart | - |
| P0 | 覆盖率 CI 集成 | - |
| P1 | LoginScreen Widget 测试 | ~6 |
| P1 | RegisterScreen Widget 测试 | ~6 |
| P1 | ChatScreen Widget 测试 | ~8 |
| P1 | api_service_test 补全 | ~8 |
| P2 | HomeScreen Widget 测试 | ~5 |
| P2 | CreateGroup Widget 测试 | ~4 |
| P2 | JoinGroup Widget 测试 | ~4 |
| P2 | websocket_service_test | ~6 |
| P3 | Golden 测试（关键页面截图对比） | ~5 |
| P3 | 关键 Widget 加 Key 标记 | - |
| P3 | 统一命名为 should_X_when_Y | - |

### 2.12 运行命令速查

```bash
# 纯 Dart Model 测试（最快，不受代理影响）
cd app && dart test test/models/

# 全量 Flutter 测试
cd app && flutter test

# 指定文件
flutter test test/providers/chat_provider_test.dart

# 指定测试名
flutter test --name "should send message"

# 覆盖率
flutter test --coverage

# 集成测试（需后端）
dart test test/integration/ --no-skip

# E2E 双账号
cd app/scripts && ./dual_test.sh
```
