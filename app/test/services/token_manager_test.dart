import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:test/test.dart';

import 'package:abao_app/services/token_manager.dart';

class MockDio extends Mock implements Dio {}

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

/// Helper to create a JWT-like token with a given exp timestamp.
String _makeToken(int expEpochSeconds) {
  final header = base64Url.encode(utf8.encode('{"alg":"HS256","typ":"JWT"}'));
  final payload =
      base64Url.encode(utf8.encode('{"sub":"user1","exp":$expEpochSeconds}'));
  final sig = base64Url.encode(utf8.encode('signature'));
  return '$header.$payload.$sig';
}

String _validToken() {
  // Expires 1 hour from now
  final exp = DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  return _makeToken(exp);
}

String _expiredToken() {
  // Expired 1 hour ago
  final exp = DateTime.now().subtract(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000;
  return _makeToken(exp);
}

String _almostExpiredToken() {
  // Expires in 10 seconds (within 30s buffer → treated as expired)
  final exp = DateTime.now().add(const Duration(seconds: 10)).millisecondsSinceEpoch ~/ 1000;
  return _makeToken(exp);
}

void main() {
  late MockDio mockDio;
  late MockFlutterSecureStorage mockStorage;
  late TokenManager tokenManager;

  setUp(() {
    mockDio = MockDio();
    mockStorage = MockFlutterSecureStorage();
    tokenManager = TokenManager.forTest(dio: mockDio, storage: mockStorage);
  });

  tearDown(() {
    tokenManager.dispose();
  });

  group('getValidAccessToken', () {
    test('returns token directly when not expired', () async {
      final token = _validToken();
      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => token);

      final result = await tokenManager.getValidAccessToken();

      expect(result, token);
      // Should NOT have called refresh
      verifyNever(() => mockDio.post(any(), data: any(named: 'data')));
    });

    test('refreshes and returns new token when expired', () async {
      final expired = _expiredToken();
      final newToken = _validToken();
      const newRefresh = 'new-refresh-token';

      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => expired);
      when(() => mockStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => 'old-refresh-token');
      when(() => mockStorage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async => Response(
          data: {'accessToken': newToken, 'refreshToken': newRefresh},
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/v1/auth/refresh'),
        ),
      );

      final result = await tokenManager.getValidAccessToken();

      expect(result, newToken);
      verify(() => mockStorage.write(key: 'access_token', value: newToken)).called(1);
      verify(() => mockStorage.write(key: 'refresh_token', value: newRefresh)).called(1);
    });

    test('treats token within 30s buffer as expired', () async {
      final almostExpired = _almostExpiredToken();
      final newToken = _validToken();

      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => almostExpired);
      when(() => mockStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => 'refresh-token');
      when(() => mockStorage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async => Response(
          data: {'accessToken': newToken, 'refreshToken': 'new-refresh'},
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/v1/auth/refresh'),
        ),
      );

      final result = await tokenManager.getValidAccessToken();

      expect(result, newToken);
    });

    test('returns null and fires sessionExpired when no access token', () async {
      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => null);

      bool sessionExpiredFired = false;
      tokenManager.onSessionExpired.listen((_) {
        sessionExpiredFired = true;
      });

      final result = await tokenManager.getValidAccessToken();

      expect(result, isNull);
      // Give the stream event time to propagate
      await Future.delayed(Duration.zero);
      expect(sessionExpiredFired, true);
    });

    test('returns null and fires sessionExpired when refresh returns 401', () async {
      final expired = _expiredToken();

      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => expired);
      when(() => mockStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => 'old-refresh');
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenThrow(
        DioException(
          response: Response(
            statusCode: 401,
            requestOptions: RequestOptions(path: '/api/v1/auth/refresh'),
          ),
          requestOptions: RequestOptions(path: '/api/v1/auth/refresh'),
        ),
      );

      bool sessionExpiredFired = false;
      tokenManager.onSessionExpired.listen((_) {
        sessionExpiredFired = true;
      });

      final result = await tokenManager.getValidAccessToken();

      expect(result, isNull);
      await Future.delayed(Duration.zero);
      expect(sessionExpiredFired, true);
    });

    test('returns null and fires sessionExpired when no refresh token', () async {
      final expired = _expiredToken();

      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => expired);
      when(() => mockStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => null);

      bool sessionExpiredFired = false;
      tokenManager.onSessionExpired.listen((_) {
        sessionExpiredFired = true;
      });

      final result = await tokenManager.getValidAccessToken();

      expect(result, isNull);
      await Future.delayed(Duration.zero);
      expect(sessionExpiredFired, true);
    });

    test('deduplicates concurrent refresh calls with Completer', () async {
      final expired = _expiredToken();
      final newToken = _validToken();
      int refreshCallCount = 0;

      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => expired);
      when(() => mockStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => 'refresh-token');
      when(() => mockStorage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async {
          refreshCallCount++;
          // Simulate network delay
          await Future.delayed(const Duration(milliseconds: 50));
          return Response(
            data: {'accessToken': newToken, 'refreshToken': 'new-refresh'},
            statusCode: 200,
            requestOptions: RequestOptions(path: '/api/v1/auth/refresh'),
          );
        },
      );

      // Fire 3 concurrent calls
      final results = await Future.wait([
        tokenManager.getValidAccessToken(),
        tokenManager.getValidAccessToken(),
        tokenManager.getValidAccessToken(),
      ]);

      expect(results, [newToken, newToken, newToken]);
      expect(refreshCallCount, 1);
    });

    test('releases lock after refresh completes, allowing subsequent refresh', () async {
      final expired = _expiredToken();
      final token1 = _validToken();
      final token2 = _validToken();
      int callCount = 0;

      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => expired);
      when(() => mockStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => 'refresh-token');
      when(() => mockStorage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async {
          callCount++;
          final token = callCount == 1 ? token1 : token2;
          return Response(
            data: {'accessToken': token, 'refreshToken': 'refresh-$callCount'},
            statusCode: 200,
            requestOptions: RequestOptions(path: '/api/v1/auth/refresh'),
          );
        },
      );

      // First refresh
      final result1 = await tokenManager.getValidAccessToken();
      expect(result1, token1);

      // Second refresh (lock should be released)
      final result2 = await tokenManager.getValidAccessToken();
      expect(result2, token2);

      expect(callCount, 2);
    });

    test('malformed token is treated as expired', () async {
      final newToken = _validToken();

      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => 'not-a-jwt');
      when(() => mockStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => 'refresh-token');
      when(() => mockStorage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});
      when(() => mockDio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async => Response(
          data: {'accessToken': newToken, 'refreshToken': 'new-refresh'},
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/v1/auth/refresh'),
        ),
      );

      final result = await tokenManager.getValidAccessToken();

      expect(result, newToken);
    });
  });

  group('onSessionExpired', () {
    test('is a broadcast stream — multiple listeners receive events', () async {
      when(() => mockStorage.read(key: 'access_token'))
          .thenAnswer((_) async => null);

      int listener1Count = 0;
      int listener2Count = 0;

      tokenManager.onSessionExpired.listen((_) => listener1Count++);
      tokenManager.onSessionExpired.listen((_) => listener2Count++);

      await tokenManager.getValidAccessToken();
      await Future.delayed(Duration.zero);

      expect(listener1Count, 1);
      expect(listener2Count, 1);
    });
  });
}
