/// API 集成测试
///
/// 这些测试需要后端服务运行。运行方式：
/// ```bash
/// dart test test/integration/api_integration_test.dart
/// ```
///
/// 前提条件：
/// 1. Docker 容器运行中 (abao-server, abao-postgres)
/// 2. 系统代理关闭或配置为绕过 localhost
library;

import 'package:test/test.dart';
import 'package:dio/dio.dart';

void main() {
  late Dio dio;
  const baseUrl = 'http://localhost:8080';

  setUp(() {
    dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));
  });

  tearDown(() {
    dio.close();
  });

  group('Health API', () {
    test('GET /api/health should return status ok', () async {
      final response = await dio.get('/api/health');

      expect(response.statusCode, 200);
      expect(response.data['status'], 'ok');
      expect(response.data['service'], 'abao-server');
    });
  });

  group('Auth API', () {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final testEmail = 'dart_test_$timestamp@example.com';
    const testPassword = 'Test123456';
    const testNickname = 'DartTester';

    test('POST /api/v1/auth/register should create new user', () async {
      final response = await dio.post('/api/v1/auth/register', data: {
        'email': testEmail,
        'password': testPassword,
        'nickname': testNickname,
      });

      expect(response.statusCode, 200);
      expect(response.data['message'], contains('验证邮件'));
    });

    test('POST /api/v1/auth/register should fail for duplicate email', () async {
      try {
        await dio.post('/api/v1/auth/register', data: {
          'email': testEmail,
          'password': testPassword,
          'nickname': 'Another',
        });
        fail('Should have thrown');
      } on DioException catch (e) {
        expect(e.response?.statusCode, 409);
      }
    });

    test('POST /api/v1/auth/login should fail for unverified email', () async {
      try {
        await dio.post('/api/v1/auth/login', data: {
          'email': testEmail,
          'password': testPassword,
        });
        fail('Should have thrown');
      } on DioException catch (e) {
        expect(e.response?.statusCode, 401);
      }
    });
  });

  group('Auth API - Authenticated', () {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final testEmail = 'dart_auth_$timestamp@example.com';
    const testPassword = 'Test123456';
    late String accessToken;
    late String refreshToken;

    setUpAll(() async {
      // Register
      await dio.post('/api/v1/auth/register', data: {
        'email': testEmail,
        'password': testPassword,
        'nickname': 'AuthTester',
      });

      // Manually verify email (requires docker exec)
      // This test assumes the email is already verified via backend script
      print('Note: Run this command to verify email:');
      print('docker exec abao-postgres psql -U postgres -d abao -c '
          '"UPDATE users SET email_verified=true WHERE email=\'$testEmail\';"');
    });

    test('POST /api/v1/auth/login should return tokens after verification', () async {
      // This test may fail if email is not verified
      // Skip in automated runs, useful for manual testing
    }, skip: 'Requires manual email verification');

    test('GET /api/v1/auth/me should return current user', () async {
      // Requires valid token
    }, skip: 'Requires authenticated session');
  });
}
