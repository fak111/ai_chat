import 'package:test/test.dart';
import 'package:abao_app/models/group.dart';

void main() {
  group('Group', () {
    final now = DateTime.now();
    final nowString = now.toIso8601String();

    group('fromJson', () {
      test('should create Group from valid JSON with all fields', () {
        final json = {
          'id': 'group-123',
          'name': 'Test Group',
          'inviteCode': 'ABC123',
          'memberCount': 5,
          'createdAt': '2024-01-01T10:00:00.000Z',
          'updatedAt': '2024-01-02T10:00:00.000Z',
          'lastMessage': 'Hello',
          'lastMessageAt': '2024-01-02T10:00:00.000Z',
          'unreadCount': 3,
        };

        final group = Group.fromJson(json);

        expect(group.id, 'group-123');
        expect(group.name, 'Test Group');
        expect(group.inviteCode, 'ABC123');
        expect(group.memberCount, 5);
        expect(group.lastMessage, 'Hello');
        expect(group.unreadCount, 3);
      });

      test('should handle missing optional fields with defaults', () {
        final json = {
          'id': 'group-123',
          'name': 'Test Group',
          'createdAt': '2024-01-01T10:00:00.000Z',
          'updatedAt': '2024-01-02T10:00:00.000Z',
        };

        final group = Group.fromJson(json);

        expect(group.inviteCode, isNull);
        expect(group.memberCount, 0);
        expect(group.lastMessage, isNull);
        expect(group.lastMessageAt, isNull);
        expect(group.unreadCount, 0);
      });
    });

    group('toJson', () {
      test('should convert Group to JSON', () {
        final group = Group(
          id: 'group-123',
          name: 'Test Group',
          inviteCode: 'ABC123',
          memberCount: 5,
          createdAt: DateTime.parse('2024-01-01T10:00:00.000Z'),
          updatedAt: DateTime.parse('2024-01-02T10:00:00.000Z'),
          lastMessage: 'Hello',
          lastMessageAt: DateTime.parse('2024-01-02T10:00:00.000Z'),
          unreadCount: 3,
        );

        final json = group.toJson();

        expect(json['id'], 'group-123');
        expect(json['name'], 'Test Group');
        expect(json['inviteCode'], 'ABC123');
        expect(json['memberCount'], 5);
        expect(json['lastMessage'], 'Hello');
        expect(json['unreadCount'], 3);
      });
    });

    group('copyWith', () {
      test('should create a copy with updated fields', () {
        final original = Group(
          id: 'group-123',
          name: 'Original Name',
          createdAt: now,
          updatedAt: now,
        );

        final copy = original.copyWith(
          name: 'Updated Name',
          lastMessage: 'New message',
        );

        expect(copy.id, 'group-123');
        expect(copy.name, 'Updated Name');
        expect(copy.lastMessage, 'New message');
      });

      test('should keep original values when not specified', () {
        final original = Group(
          id: 'group-123',
          name: 'Original Name',
          inviteCode: 'ABC123',
          memberCount: 5,
          createdAt: now,
          updatedAt: now,
        );

        final copy = original.copyWith(name: 'Updated Name');

        expect(copy.inviteCode, 'ABC123');
        expect(copy.memberCount, 5);
      });
    });
  });
}
