import 'package:test/test.dart';
import 'package:abao_app/models/message.dart';

void main() {
  group('Message', () {
    group('fromJson', () {
      test('should create Message from valid JSON', () {
        final json = {
          'id': 'msg-123',
          'groupId': 'group-456',
          'senderId': 'user-789',
          'senderNickname': 'TestUser',
          'content': 'Hello World',
          'messageType': 'USER',
          'replyToId': null,
          'replyToContent': null,
          'createdAt': '2024-01-01T10:00:00.000Z',
        };

        final message = Message.fromJson(json);

        expect(message.id, 'msg-123');
        expect(message.groupId, 'group-456');
        expect(message.senderId, 'user-789');
        expect(message.senderNickname, 'TestUser');
        expect(message.content, 'Hello World');
        expect(message.messageType, MessageType.user);
        expect(message.replyToId, isNull);
        expect(message.replyToContent, isNull);
      });

      test('should parse AI message type', () {
        final json = {
          'id': 'msg-123',
          'groupId': 'group-456',
          'content': 'AI Response',
          'messageType': 'AI',
          'createdAt': '2024-01-01T10:00:00.000Z',
        };

        final message = Message.fromJson(json);

        expect(message.messageType, MessageType.ai);
        expect(message.isAI, true);
        expect(message.isUser, false);
      });

      test('should parse SYSTEM message type', () {
        final json = {
          'id': 'msg-123',
          'groupId': 'group-456',
          'content': 'User joined',
          'messageType': 'SYSTEM',
          'createdAt': '2024-01-01T10:00:00.000Z',
        };

        final message = Message.fromJson(json);

        expect(message.messageType, MessageType.system);
        expect(message.isSystem, true);
      });

      test('should default to USER type for unknown/null types', () {
        final json = {
          'id': 'msg-123',
          'groupId': 'group-456',
          'content': 'Hello',
          'messageType': null,
          'createdAt': '2024-01-01T10:00:00.000Z',
        };

        final message = Message.fromJson(json);

        expect(message.messageType, MessageType.user);
      });

      test('should handle case-insensitive message type', () {
        final json = {
          'id': 'msg-123',
          'groupId': 'group-456',
          'content': 'AI Response',
          'messageType': 'ai',
          'createdAt': '2024-01-01T10:00:00.000Z',
        };

        final message = Message.fromJson(json);

        expect(message.messageType, MessageType.ai);
      });

      test('should parse reply information', () {
        final json = {
          'id': 'msg-123',
          'groupId': 'group-456',
          'content': 'This is a reply',
          'messageType': 'USER',
          'replyToId': 'msg-100',
          'replyToContent': 'Original message',
          'createdAt': '2024-01-01T10:00:00.000Z',
        };

        final message = Message.fromJson(json);

        expect(message.replyToId, 'msg-100');
        expect(message.replyToContent, 'Original message');
      });
    });

    group('toJson', () {
      test('should convert Message to JSON', () {
        final message = Message(
          id: 'msg-123',
          groupId: 'group-456',
          senderId: 'user-789',
          senderNickname: 'TestUser',
          content: 'Hello World',
          messageType: MessageType.user,
          replyToId: 'msg-100',
          replyToContent: 'Original',
          createdAt: DateTime.parse('2024-01-01T10:00:00.000Z'),
        );

        final json = message.toJson();

        expect(json['id'], 'msg-123');
        expect(json['groupId'], 'group-456');
        expect(json['senderId'], 'user-789');
        expect(json['senderNickname'], 'TestUser');
        expect(json['content'], 'Hello World');
        expect(json['messageType'], 'USER');
        expect(json['replyToId'], 'msg-100');
        expect(json['replyToContent'], 'Original');
      });

      test('should output AI message type in uppercase', () {
        final message = Message(
          id: 'msg-123',
          groupId: 'group-456',
          content: 'AI Response',
          messageType: MessageType.ai,
          createdAt: DateTime.now(),
        );

        final json = message.toJson();

        expect(json['messageType'], 'AI');
      });
    });

    group('convenience getters', () {
      test('isAI returns true for AI messages', () {
        final message = Message(
          id: 'msg-123',
          groupId: 'group-456',
          content: 'AI Response',
          messageType: MessageType.ai,
          createdAt: DateTime.now(),
        );

        expect(message.isAI, true);
        expect(message.isUser, false);
        expect(message.isSystem, false);
      });

      test('isUser returns true for user messages', () {
        final message = Message(
          id: 'msg-123',
          groupId: 'group-456',
          content: 'Hello',
          messageType: MessageType.user,
          createdAt: DateTime.now(),
        );

        expect(message.isUser, true);
        expect(message.isAI, false);
        expect(message.isSystem, false);
      });

      test('isSystem returns true for system messages', () {
        final message = Message(
          id: 'msg-123',
          groupId: 'group-456',
          content: 'User joined',
          messageType: MessageType.system,
          createdAt: DateTime.now(),
        );

        expect(message.isSystem, true);
        expect(message.isAI, false);
        expect(message.isUser, false);
      });
    });
  });
}
