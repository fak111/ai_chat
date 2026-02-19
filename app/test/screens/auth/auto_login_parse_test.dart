import 'package:test/test.dart';
import 'package:abao_app/utils/auto_login_utils.dart';

void main() {
  group('parseAutoLoginParam', () {
    test('parses valid email:password', () {
      final result = parseAutoLoginParam('test@example.com:Password123');
      expect(result, isNotNull);
      expect(result!.email, 'test@example.com');
      expect(result.password, 'Password123');
    });

    test('splits at first colon only (password with colons)', () {
      final result = parseAutoLoginParam('user@test.com:pass:word:123');
      expect(result, isNotNull);
      expect(result!.email, 'user@test.com');
      expect(result.password, 'pass:word:123');
    });

    test('returns null for null input', () {
      expect(parseAutoLoginParam(null), isNull);
    });

    test('returns null for input without colon', () {
      expect(parseAutoLoginParam('nocolon'), isNull);
    });

    test('returns null for empty email', () {
      expect(parseAutoLoginParam(':password'), isNull);
    });

    test('returns null for empty password', () {
      expect(parseAutoLoginParam('email@test.com:'), isNull);
    });

    test('returns null for empty string', () {
      expect(parseAutoLoginParam(''), isNull);
    });
  });

  group('extractAutoLoginFromUri', () {
    test('extracts from regular query parameter', () {
      final uri = Uri.parse('http://localhost:9191/?auto_login=a@b.com:pass');
      expect(extractAutoLoginFromUri(uri), 'a@b.com:pass');
    });

    test('extracts from hash fragment (Flutter web format)', () {
      final uri =
          Uri.parse('http://localhost:9191/#/?auto_login=a@b.com:pass');
      expect(extractAutoLoginFromUri(uri), 'a@b.com:pass');
    });

    test('extracts from hash fragment with route path', () {
      final uri = Uri.parse(
          'http://localhost:9191/#/splash?auto_login=a@b.com:pass');
      expect(extractAutoLoginFromUri(uri), 'a@b.com:pass');
    });

    test('prefers regular query param over fragment', () {
      final uri = Uri.parse(
          'http://localhost:9191/?auto_login=from_query#/?auto_login=from_frag');
      expect(extractAutoLoginFromUri(uri), 'from_query');
    });

    test('returns null when no auto_login anywhere', () {
      final uri = Uri.parse('http://localhost:9191/#/');
      expect(extractAutoLoginFromUri(uri), isNull);
    });

    test('returns null for plain URL without fragment', () {
      final uri = Uri.parse('http://localhost:9191/');
      expect(extractAutoLoginFromUri(uri), isNull);
    });

    test('returns null for fragment without query string', () {
      final uri = Uri.parse('http://localhost:9191/#/somepath');
      expect(extractAutoLoginFromUri(uri), isNull);
    });
  });

  group('getAutoLoginFromDartDefine', () {
    test('returns null when AUTO_LOGIN not defined', () {
      expect(getAutoLoginFromDartDefine(), isNull);
    });

    test('dart-define value parseable by parseAutoLoginParam', () {
      const simulated = 'a@t.com:TestPass123';
      final result = parseAutoLoginParam(simulated);
      expect(result, isNotNull);
      expect(result!.email, 'a@t.com');
      expect(result.password, 'TestPass123');
    });
  });
}
