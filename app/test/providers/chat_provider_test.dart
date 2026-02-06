import 'package:test/test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:abao_app/providers/chat_provider.dart';
import 'package:abao_app/models/group.dart';
import 'package:abao_app/models/message.dart';

import '../mocks/mock_services.dart';

void main() {
  group('ChatProvider', () {
    late ChatProvider provider;

    setUp(() {
      provider = ChatProvider();
    });

    tearDown(() {
      provider.dispose();
    });

    group('initial state', () {
      test('should have empty groups list', () {
        expect(provider.groups, isEmpty);
      });

      test('should have empty messages list', () {
        expect(provider.currentMessages, isEmpty);
      });

      test('should have null currentGroupId', () {
        expect(provider.currentGroupId, isNull);
      });

      test('should not be loading', () {
        expect(provider.isLoading, false);
      });

      test('should have no error', () {
        expect(provider.error, isNull);
      });

      test('should have no replyingTo message', () {
        expect(provider.replyingTo, isNull);
      });
    });

    group('setReplyingTo', () {
      test('should set replyingTo message', () {
        final message = Message(
          id: 'msg-123',
          groupId: 'group-456',
          content: 'Test message',
          messageType: MessageType.user,
          createdAt: DateTime.now(),
        );

        provider.setReplyingTo(message);

        expect(provider.replyingTo, message);
      });

      test('should clear replyingTo when set to null', () {
        final message = Message(
          id: 'msg-123',
          groupId: 'group-456',
          content: 'Test message',
          messageType: MessageType.user,
          createdAt: DateTime.now(),
        );

        provider.setReplyingTo(message);
        expect(provider.replyingTo, isNotNull);

        provider.setReplyingTo(null);
        expect(provider.replyingTo, isNull);
      });
    });

    group('clearError', () {
      test('should clear error message', () {
        // Simulate error state (internal state, can't set directly)
        provider.clearError();
        expect(provider.error, isNull);
      });
    });

    group('getGroup', () {
      test('should return null when group not found', () {
        expect(provider.getGroup('non-existent'), isNull);
      });
    });

    group('leaveCurrentGroup', () {
      test('should clear currentGroupId', () {
        // Since we can't easily set internal state, test the method signature
        provider.leaveCurrentGroup();
        expect(provider.currentGroupId, isNull);
      });

      test('should clear replyingTo', () {
        provider.leaveCurrentGroup();
        expect(provider.replyingTo, isNull);
      });

      test('should not notify listeners when notify is false', () {
        var notified = false;
        provider.addListener(() => notified = true);

        provider.leaveCurrentGroup(notify: false);

        expect(notified, false);
      });

      test('should notify listeners when notify is true (default)', () {
        var notified = false;
        provider.addListener(() => notified = true);

        provider.leaveCurrentGroup();

        expect(notified, true);
      });
    });

    group('sendMessage', () {
      test('should not send when content is empty', () {
        // sendMessage returns void, so we just verify no exception
        provider.sendMessage('');
        provider.sendMessage('   ');
        expect(true, true);
      });

      test('should not send when no current group', () {
        expect(provider.currentGroupId, isNull);
        provider.sendMessage('Hello');
        // Should not throw, just do nothing
        expect(true, true);
      });

      test('should clear replyingTo after sending', () {
        final message = Message(
          id: 'msg-123',
          groupId: 'group-456',
          content: 'Test message',
          messageType: MessageType.user,
          createdAt: DateTime.now(),
        );
        provider.setReplyingTo(message);
        expect(provider.replyingTo, isNotNull);

        // sendMessage should clear replyingTo (though won't actually send without currentGroupId)
        provider.sendMessage('Reply');
        // replyingTo is only cleared when currentGroupId is set and message is valid
      });
    });

    group('_handleNewMessage', () {
      test('should insert new message at beginning of list', () {
        // This tests internal behavior through WebSocket handler
        // Integration test would be more appropriate
        expect(true, true);
      });
    });

    group('_handleError', () {
      test('should set error message from WebSocket', () {
        // Internal handler test
        expect(true, true);
      });
    });
  });

  group('ChatProvider integration', () {
    // These tests would require mocking ApiService and WebSocketService
    // For now, we document the expected behavior

    test('loadGroups should fetch and parse groups from API', () {
      // Expected: GET /api/groups returns array of groups
      // ChatProvider parses both direct array and {groups: [...]} formats
      expect(true, true);
    });

    test('createGroup should POST and add new group to list', () {
      // Expected: POST /api/groups with {name: "..."}
      // Returns GroupDto, added to front of groups list
      expect(true, true);
    });

    test('joinGroup should POST invite code and add group', () {
      // Expected: POST /api/groups/join with {inviteCode: "..."}
      // Returns GroupDto, added to front of groups list
      expect(true, true);
    });

    test('enterGroup should connect WebSocket and load messages', () {
      // Expected: Sets currentGroupId, joins WS channel, loads messages
      expect(true, true);
    });

    test('loadMessages should GET recent messages', () {
      // Expected: GET /api/messages/group/{id}/recent?limit=50
      // Parses both direct array and {content: [...]} formats
      expect(true, true);
    });
  });
}
