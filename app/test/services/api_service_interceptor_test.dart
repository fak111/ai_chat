import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:test/test.dart';

import 'package:abao_app/services/api_service.dart';
import 'package:abao_app/services/token_manager.dart';

class MockTokenManager extends Mock implements TokenManager {}

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late Dio dio;
  late MockTokenManager mockTokenManager;
  late MockFlutterSecureStorage mockStorage;

  setUp(() {
    mockTokenManager = MockTokenManager();
    mockStorage = MockFlutterSecureStorage();

    // Create an ApiService with injected dependencies for testing
    dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));

    // Install the interceptor under test
    ApiService.installInterceptors(
      dio: dio,
      storage: mockStorage,
      tokenManager: mockTokenManager,
    );
  });

  group('401 interceptor', () {
    test('401 → refresh success → retry succeeds → caller gets 200', () async {
      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => 'valid-token');
      when(() => mockTokenManager.getValidAccessToken())
          .thenAnswer((_) async => 'new-valid-token');

      // Use a custom adapter to simulate 401 then 200 on retry
      int callCount = 0;
      dio.httpClientAdapter = _FakeAdapter((options, _, __) async {
        callCount++;
        if (callCount == 1) {
          // First request: 401
          return ResponseBody.fromString(
            '{"error":"Unauthorized"}',
            401,
            headers: {
              Headers.contentTypeHeader: ['application/json'],
            },
          );
        }
        // Retry: 200
        return ResponseBody.fromString(
          '{"data":"success"}',
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final response = await dio.get('/api/groups');

      expect(response.statusCode, 200);
      expect(callCount, 2);
      verify(() => mockTokenManager.getValidAccessToken()).called(1);
    });

    test('401 → refresh fails → caller gets 401', () async {
      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => 'old-token');
      when(() => mockTokenManager.getValidAccessToken())
          .thenAnswer((_) async => null);

      dio.httpClientAdapter = _FakeAdapter((options, _, __) async {
        return ResponseBody.fromString(
          '{"error":"Unauthorized"}',
          401,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      expect(
        () => dio.get('/api/groups'),
        throwsA(isA<DioException>().having(
          (e) => e.response?.statusCode,
          'statusCode',
          401,
        )),
      );
    });

    test('500 error does not trigger refresh', () async {
      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => 'valid-token');

      dio.httpClientAdapter = _FakeAdapter((options, _, __) async {
        return ResponseBody.fromString(
          '{"error":"Internal Server Error"}',
          500,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      expect(
        () => dio.get('/api/groups'),
        throwsA(isA<DioException>().having(
          (e) => e.response?.statusCode,
          'statusCode',
          500,
        )),
      );

      verifyNever(() => mockTokenManager.getValidAccessToken());
    });

    test('/api/auth/refresh 401 does not retry', () async {
      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => 'token');

      int callCount = 0;
      dio.httpClientAdapter = _FakeAdapter((options, _, __) async {
        callCount++;
        return ResponseBody.fromString(
          '{"error":"Unauthorized"}',
          401,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      expect(
        () => dio.post('/api/auth/refresh', data: {}),
        throwsA(isA<DioException>()),
      );

      // Wait for async operations
      await Future.delayed(const Duration(milliseconds: 100));

      expect(callCount, 1);
      verifyNever(() => mockTokenManager.getValidAccessToken());
    });

    test('/api/auth/login 401 does not retry', () async {
      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => null);

      int callCount = 0;
      dio.httpClientAdapter = _FakeAdapter((options, _, __) async {
        callCount++;
        return ResponseBody.fromString(
          '{"error":"Wrong password"}',
          401,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      expect(
        () => dio.post('/api/auth/login', data: {}),
        throwsA(isA<DioException>()),
      );

      await Future.delayed(const Duration(milliseconds: 100));

      expect(callCount, 1);
      verifyNever(() => mockTokenManager.getValidAccessToken());
    });
  });
}

/// Minimal fake HttpClientAdapter for testing Dio interceptors.
class _FakeAdapter implements HttpClientAdapter {
  final Future<ResponseBody> Function(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) _handler;

  _FakeAdapter(this._handler);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    return _handler(options, requestStream, cancelFuture);
  }

  @override
  void close({bool force = false}) {}
}
