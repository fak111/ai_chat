import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'token_manager.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  late final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  // TODO: Update with actual server URL
  static const String baseUrl = 'http://localhost:8080';

  static const _authPaths = {'/api/auth/refresh', '/api/auth/login'};

  ApiService._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
      },
    ));

    installInterceptors(
      dio: _dio,
      storage: _storage,
      tokenManager: TokenManager(),
    );
  }

  /// Install auth interceptors on a Dio instance. Exposed for testing.
  static void installInterceptors({
    required Dio dio,
    required FlutterSecureStorage storage,
    required TokenManager tokenManager,
  }) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) async {
        final response = error.response;
        final requestPath = error.requestOptions.path;

        if (response?.statusCode == 401 &&
            !_authPaths.contains(requestPath) &&
            error.requestOptions.extra['_retried'] != true) {
          final newToken = await tokenManager.getValidAccessToken();
          if (newToken != null) {
            // Retry the original request with the new token
            final opts = error.requestOptions;
            opts.headers['Authorization'] = 'Bearer $newToken';
            opts.extra['_retried'] = true;
            try {
              final retryResponse = await dio.fetch(opts);
              return handler.resolve(retryResponse);
            } on DioException catch (retryError) {
              return handler.next(retryError);
            }
          }
        }
        return handler.next(error);
      },
    ));
  }

  Future<dynamic> get(String path) async {
    final response = await _dio.get(path);
    return response.data;
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> data) async {
    final response = await _dio.post(path, data: data);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> data) async {
    final response = await _dio.put(path, data: data);
    return response.data as Map<String, dynamic>;
  }

  Future<void> delete(String path) async {
    await _dio.delete(path);
  }
}
