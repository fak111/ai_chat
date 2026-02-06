import 'package:test/test.dart';
import 'package:abao_app/models/user.dart';

void main() {
  group('User', () {
    group('fromJson', () {
      test('should create User from valid JSON with all fields', () {
        final json = {
          'id': 'user-123',
          'email': 'test@example.com',
          'nickname': 'TestUser',
          'avatarUrl': 'https://example.com/avatar.png',
          'createdAt': '2024-01-01T10:00:00.000Z',
        };

        final user = User.fromJson(json);

        expect(user.id, 'user-123');
        expect(user.email, 'test@example.com');
        expect(user.nickname, 'TestUser');
        expect(user.avatarUrl, 'https://example.com/avatar.png');
        expect(user.createdAt, DateTime.parse('2024-01-01T10:00:00.000Z'));
      });

      test('should create User from JSON with nullable fields as null', () {
        final json = {
          'id': 'user-123',
          'email': 'test@example.com',
          'nickname': null,
          'avatarUrl': null,
          'createdAt': '2024-01-01T10:00:00.000Z',
        };

        final user = User.fromJson(json);

        expect(user.id, 'user-123');
        expect(user.email, 'test@example.com');
        expect(user.nickname, isNull);
        expect(user.avatarUrl, isNull);
      });
    });

    group('toJson', () {
      test('should convert User to JSON', () {
        final user = User(
          id: 'user-123',
          email: 'test@example.com',
          nickname: 'TestUser',
          avatarUrl: 'https://example.com/avatar.png',
          createdAt: DateTime.parse('2024-01-01T10:00:00.000Z'),
        );

        final json = user.toJson();

        expect(json['id'], 'user-123');
        expect(json['email'], 'test@example.com');
        expect(json['nickname'], 'TestUser');
        expect(json['avatarUrl'], 'https://example.com/avatar.png');
        expect(json['createdAt'], '2024-01-01T10:00:00.000Z');
      });

      test('should handle null values in toJson', () {
        final user = User(
          id: 'user-123',
          email: 'test@example.com',
          createdAt: DateTime.parse('2024-01-01T10:00:00.000Z'),
        );

        final json = user.toJson();

        expect(json['nickname'], isNull);
        expect(json['avatarUrl'], isNull);
      });
    });

    group('displayName', () {
      test('should return nickname when available', () {
        final user = User(
          id: 'user-123',
          email: 'test@example.com',
          nickname: 'TestUser',
          createdAt: DateTime.now(),
        );

        expect(user.displayName, 'TestUser');
      });

      test('should return email prefix when nickname is null', () {
        final user = User(
          id: 'user-123',
          email: 'john.doe@example.com',
          createdAt: DateTime.now(),
        );

        expect(user.displayName, 'john.doe');
      });
    });
  });
}
