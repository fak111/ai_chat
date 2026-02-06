import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:abao_app/services/api_service.dart';
import 'package:abao_app/services/auth_service.dart';
import 'package:abao_app/services/token_manager.dart';
import 'package:abao_app/services/websocket_service.dart';

// Mock classes
class MockDio extends Mock implements Dio {}

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

class MockApiService extends Mock implements ApiService {}

class MockAuthService extends Mock implements AuthService {}

class MockTokenManager extends Mock implements TokenManager {}

class MockWebSocketService extends Mock implements WebSocketService {}

// Fake classes for registerFallbackValue
class FakeRequestOptions extends Fake implements RequestOptions {}

class FakeUri extends Fake implements Uri {}
