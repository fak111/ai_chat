# A宝 Flutter 测试套件

## 测试结构

```
test/
├── models/           # 数据模型测试 (纯 Dart)
│   ├── user_test.dart
│   ├── group_test.dart
│   └── message_test.dart
├── services/         # 服务层测试
│   └── auth_service_test.dart
├── providers/        # 状态管理测试
│   ├── auth_provider_test.dart
│   └── chat_provider_test.dart
├── integration/      # 集成测试
│   └── api_integration_test.dart
├── mocks/           # Mock 类
│   └── mock_services.dart
└── widget_test.dart  # Widget 测试
```

## 运行测试

### 1. Model 测试 (推荐)

Model 测试是纯 Dart 测试，不依赖 Flutter 框架，可直接运行：

```bash
cd app
dart test test/models/
```

### 2. Flutter 测试

Flutter 测试需要 Flutter 环境。如果遇到网络问题，需要临时关闭系统代理：

```bash
# macOS 临时关闭代理
networksetup -setwebproxystate "Wi-Fi" off
networksetup -setsecurewebproxystate "Wi-Fi" off

# 运行测试
flutter test

# 恢复代理
networksetup -setwebproxystate "Wi-Fi" on
networksetup -setsecurewebproxystate "Wi-Fi" on
```

### 3. API 集成测试

需要后端服务运行：

```bash
# 确保 Docker 容器运行
docker ps | grep abao

# 运行集成测试
dart test test/integration/
```

## 测试覆盖率

运行带覆盖率的测试：

```bash
flutter test --coverage
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html
```

## 当前测试用例统计

| 模块 | 文件 | 用例数 | 状态 |
|------|------|--------|------|
| Model | user_test.dart | 6 | ✅ |
| Model | group_test.dart | 5 | ✅ |
| Model | message_test.dart | 11 | ✅ |
| Service | auth_service_test.dart | 6 | ⚠️ 需要 DI |
| Provider | auth_provider_test.dart | 10 | ⚠️ 需要 Flutter |
| Provider | chat_provider_test.dart | 15 | ⚠️ 需要 Flutter |
| Widget | widget_test.dart | 1 | ⚠️ 需要 Flutter |
| **总计** | | **54** | |

## 已知问题

### 代理导致测试失败

如果系统开启了 HTTP 代理（如 Clash），Flutter 测试会失败：
```
HttpException: Connection closed before full header was received
```

**解决方案**: 临时关闭系统代理运行测试。

### 单例模式影响测试

`ApiService`、`WebSocketService` 使用单例模式，难以 mock。

**建议**: 未来重构为依赖注入模式，提高可测试性。

## Mock 使用

项目使用 `mocktail` 进行 mock：

```dart
import 'package:mocktail/mocktail.dart';
import '../mocks/mock_services.dart';

void main() {
  late MockApiService mockApi;

  setUp(() {
    mockApi = MockApiService();
  });

  test('example', () {
    when(() => mockApi.get('/api/health')).thenAnswer(
      (_) async => {'status': 'ok'},
    );
    // ...
  });
}
```

## 贡献指南

1. 新功能必须包含测试
2. 测试应遵循 AAA 模式 (Arrange-Act-Assert)
3. 使用描述性的测试名称
4. 保持测试独立，避免相互依赖
