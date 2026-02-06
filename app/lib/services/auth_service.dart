import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user.dart';
import 'api_service.dart';

class AuthService {
  final ApiService _api = ApiService();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _userKey = 'user_data';

  Future<bool> isLoggedIn() async {
    final token = await _storage.read(key: _accessTokenKey);
    return token != null && token.isNotEmpty;
  }

  Future<User> login(String email, String password) async {
    final response = await _api.post('/api/auth/login', {
      'email': email,
      'password': password,
    });

    await _storage.write(key: _accessTokenKey, value: response['accessToken']);
    await _storage.write(key: _refreshTokenKey, value: response['refreshToken']);

    final user = User.fromJson(response['user']);
    return user;
  }

  Future<void> register(String email, String password, String? nickname) async {
    await _api.post('/api/auth/register', {
      'email': email,
      'password': password,
      if (nickname != null) 'nickname': nickname,
    });
  }

  Future<void> verifyEmail(String token) async {
    await _api.post('/api/auth/verify', {'token': token});
  }

  Future<User?> getCurrentUser() async {
    try {
      final response = await _api.get('/api/auth/me');
      return User.fromJson(response);
    } catch (e) {
      return null;
    }
  }

  Future<String?> getAccessToken() async {
    return await _storage.read(key: _accessTokenKey);
  }

  Future<void> refreshToken() async {
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    if (refreshToken == null) throw Exception('No refresh token');

    final response = await _api.post('/api/auth/refresh', {
      'refreshToken': refreshToken,
    });

    await _storage.write(key: _accessTokenKey, value: response['accessToken']);

    if (response['refreshToken'] != null) {
      await _storage.write(key: _refreshTokenKey, value: response['refreshToken']);
    }
  }

  Future<void> logout() async {
    try {
      await _api.post('/api/auth/logout', {});
    } catch (_) {
      // Ignore errors during logout
    }
    await _storage.deleteAll();
  }
}
