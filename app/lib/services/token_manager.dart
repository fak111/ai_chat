import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_service.dart';

class TokenManager {
  static final TokenManager _instance = TokenManager._internal();
  factory TokenManager() => _instance;

  late final Dio _dio;
  late final FlutterSecureStorage _storage;
  Completer<String?>? _refreshCompleter;

  final StreamController<void> _sessionExpiredController =
      StreamController<void>.broadcast();

  Stream<void> get onSessionExpired => _sessionExpiredController.stream;

  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';

  TokenManager._internal() {
    _storage = const FlutterSecureStorage();
    // Independent Dio instance — no interceptors, avoids circular refresh
    _dio = Dio(BaseOptions(
      baseUrl: ApiService.baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {'Content-Type': 'application/json'},
    ));
  }

  /// Test constructor — inject dependencies.
  TokenManager.forTest({required Dio dio, required FlutterSecureStorage storage})
      : _dio = dio,
        _storage = storage;

  /// Returns a valid access token, refreshing if needed.
  /// Returns null if no valid session exists (triggers [onSessionExpired]).
  Future<String?> getValidAccessToken() async {
    // If a refresh is already in flight, wait for it
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }

    final token = await _storage.read(key: _accessTokenKey);

    if (token == null) {
      _sessionExpiredController.add(null);
      return null;
    }

    if (!_isTokenExpired(token)) {
      return token;
    }

    // Token expired — attempt refresh
    return _doRefresh();
  }

  Future<String?> _doRefresh() async {
    _refreshCompleter = Completer<String?>();

    try {
      final refreshToken = await _storage.read(key: _refreshTokenKey);
      if (refreshToken == null) {
        _sessionExpiredController.add(null);
        _refreshCompleter!.complete(null);
        return null;
      }

      final response = await _dio.post(
        '/api/v1/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      final data = response.data as Map<String, dynamic>;
      final newAccessToken = data['accessToken'] as String;

      await _storage.write(key: _accessTokenKey, value: newAccessToken);

      // Save rotated refresh token
      if (data['refreshToken'] != null) {
        await _storage.write(
            key: _refreshTokenKey, value: data['refreshToken'] as String);
      }

      debugPrint('TokenManager: token refreshed successfully');
      _refreshCompleter!.complete(newAccessToken);
      return newAccessToken;
    } catch (e) {
      debugPrint('TokenManager: refresh failed: $e');
      _sessionExpiredController.add(null);
      _refreshCompleter!.complete(null);
      return null;
    } finally {
      _refreshCompleter = null;
    }
  }

  /// Decodes JWT payload to check exp claim.
  /// Returns true if expired or will expire within 30 seconds.
  bool _isTokenExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;

      final payload = base64Url.normalize(parts[1]);
      final decoded = utf8.decode(base64Url.decode(payload));
      final claims = jsonDecode(decoded) as Map<String, dynamic>;

      final exp = claims['exp'] as int?;
      if (exp == null) return true;

      final expiry = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
      return DateTime.now()
          .isAfter(expiry.subtract(const Duration(seconds: 30)));
    } catch (e) {
      return true;
    }
  }

  void dispose() {
    _sessionExpiredController.close();
  }
}
