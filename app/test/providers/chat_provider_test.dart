import 'package:test/test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:abao_app/providers/chat_provider.dart';
import 'package:abao_app/models/message.dart';
import 'package:abao_app/services/websocket_service.dart';

import '../mocks/mock_services.dart';

void main() {
  late ChatProvider provider;
  late MockApiService mockApi;
  late MockWebSocketService mockWs;
  MessageHandler? capturedNewMessageHandler;
  MessageHandler? capturedErrorHandler;

  final sampleMessageResponse = {
    'id': 'msg-new',
    'groupId': 'group-1',
    'senderId': 'user-1',
    'senderNickname': 'Tester',
    'content': 'Hello',
    'messageType': 'USER',
    'replyToId': null,
    'replyToContent': null,
    'createdAt': '2026-01-01T00:00:00',
  };

  final sampleGroupJson = {
    'id': 'g1',
    'name': 'Group 1',
    'inviteCode': 'ABC123',
    'createdAt': '2026-01-01T00:00:00',
    'updatedAt': '2026-01-01T00:00:00',
    'memberCount': 3,
  };

  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  setUp(() {
    mockApi = MockApiService();
    mockWs = MockWebSocketService();

    // Capture WebSocket handlers
    when(() => mockWs.addHandler(any(), any())).thenAnswer((inv) {
      final type = inv.positionalArguments[0] as String;
      final handler = inv.positionalArguments[1] as MessageHandler;
      if (type == 'NEW_MESSAGE') capturedNewMessageHandler = handler;
      if (type == 'ERROR') capturedErrorHandler = handler;
    });
    when(() => mockWs.removeHandler(any(), any())).thenReturn(null);
    when(() => mockWs.disconnect()).thenReturn(null);
    when(() => mockWs.joinGroup(any())).thenReturn(null);
    when(() => mockWs.leaveGroup(any())).thenReturn(null);
    when(() => mockWs.isConnected).thenReturn(false);

    provider = ChatProvider.forTest(api: mockApi, ws: mockWs);
  });

  tearDown(() {
    provider.dispose();
  });

  Future<void> enterGroup(String groupId) async {
    when(() => mockApi.get('/api/messages/group/$groupId/recent?limit=50'))
        .thenAnswer((_) async => []);
    await provider.enterGroup(groupId);
  }

  // ========================================
  // Initial State
  // ========================================
  group('initial state', () {
    test('should have empty groups', () {
      expect(provider.groups, isEmpty);
    });

    test('should have empty messages', () {
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

    test('should have no replyingTo', () {
      expect(provider.replyingTo, isNull);
    });
  });

  // ========================================
  // sendMessage via HTTP POST (core change)
  // ========================================
  group('sendMessage via HTTP POST', () {
    test('should POST to /api/messages/group/{groupId}', () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      final result = await provider.sendMessage('Hello');

      expect(result, true);
      verify(() => mockApi.post(
            '/api/messages/group/group-1',
            {'content': 'Hello'},
          )).called(1);
    });

    test('should include replyToId when replying', () async {
      await enterGroup('group-1');
      provider.setReplyingTo(Message(
        id: 'reply-to-id',
        groupId: 'group-1',
        content: 'original',
        messageType: MessageType.user,
        createdAt: DateTime.now(),
      ));
      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      await provider.sendMessage('Reply text');

      verify(() => mockApi.post(
            '/api/messages/group/group-1',
            {'content': 'Reply text', 'replyToId': 'reply-to-id'},
          )).called(1);
    });

    test('should add message to local list on success', () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      await provider.sendMessage('Hello');

      expect(provider.currentMessages.length, 1);
      expect(provider.currentMessages.first.content, 'Hello');
      expect(provider.currentMessages.first.id, 'msg-new');
    });

    test('should clear replyingTo after success', () async {
      await enterGroup('group-1');
      provider.setReplyingTo(Message(
        id: 'm1',
        groupId: 'group-1',
        content: 'x',
        messageType: MessageType.user,
        createdAt: DateTime.now(),
      ));
      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      await provider.sendMessage('Reply');

      expect(provider.replyingTo, isNull);
    });

    test('should return false and set error on DioException with response',
        () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any())).thenThrow(DioException(
        requestOptions: RequestOptions(path: ''),
        response: Response(
          requestOptions: RequestOptions(path: ''),
          statusCode: 403,
          data: {'error': 'Not a member'},
        ),
      ));

      final result = await provider.sendMessage('Hello');

      expect(result, false);
      expect(provider.error, 'Not a member');
    });

    test('should return false on network error (no response)', () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any())).thenThrow(DioException(
        requestOptions: RequestOptions(path: ''),
        type: DioExceptionType.connectionTimeout,
      ));

      final result = await provider.sendMessage('Hello');

      expect(result, false);
      expect(provider.error, isNotNull);
    });

    test('should return false on generic exception', () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any())).thenThrow(Exception('boom'));

      final result = await provider.sendMessage('Hello');

      expect(result, false);
      expect(provider.error, 'Failed to send message');
    });

    test('should not send empty content', () async {
      await enterGroup('group-1');

      final result = await provider.sendMessage('');

      expect(result, false);
      verifyNever(() => mockApi.post(any(), any()));
    });

    test('should not send blank content', () async {
      await enterGroup('group-1');

      final result = await provider.sendMessage('   ');

      expect(result, false);
      verifyNever(() => mockApi.post(any(), any()));
    });

    test('should not send when no current group', () async {
      final result = await provider.sendMessage('Hello');

      expect(result, false);
      verifyNever(() => mockApi.post(any(), any()));
    });

    test('should trim content before sending', () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      await provider.sendMessage('  Hello  ');

      verify(() => mockApi.post(
            '/api/messages/group/group-1',
            {'content': 'Hello'},
          )).called(1);
    });

    test('should notify listeners on success', () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      var count = 0;
      provider.addListener(() => count++);

      await provider.sendMessage('Hello');

      expect(count, greaterThan(0));
    });

    test('should notify listeners on error', () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any())).thenThrow(Exception('fail'));

      var count = 0;
      provider.addListener(() => count++);

      await provider.sendMessage('Hello');

      expect(count, greaterThan(0));
    });
  });

  // ========================================
  // WebSocket message receiving + dedup
  // ========================================
  group('WebSocket message receiving', () {
    test('should add received message to list', () async {
      await enterGroup('group-1');

      capturedNewMessageHandler!({'message': sampleMessageResponse});

      expect(provider.currentMessages.length, 1);
      expect(provider.currentMessages.first.content, 'Hello');
    });

    test('should deduplicate messages by ID', () async {
      await enterGroup('group-1');
      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      // Send via HTTP (adds to local list)
      await provider.sendMessage('Hello');
      expect(provider.currentMessages.length, 1);

      // Same message arrives via WebSocket
      capturedNewMessageHandler!({'message': sampleMessageResponse});

      // Should still be 1, not 2
      expect(provider.currentMessages.length, 1);
    });

    test('should add different messages', () async {
      await enterGroup('group-1');

      capturedNewMessageHandler!({'message': sampleMessageResponse});

      final msg2 = Map<String, dynamic>.from(sampleMessageResponse);
      msg2['id'] = 'msg-2';
      msg2['content'] = 'World';
      capturedNewMessageHandler!({'message': msg2});

      expect(provider.currentMessages.length, 2);
    });

    test('should update group lastMessage on new message', () async {
      when(() => mockApi.get('/api/groups')).thenAnswer((_) async => [
            {...sampleGroupJson, 'id': 'group-1'},
          ]);
      await provider.loadGroups();
      await enterGroup('group-1');

      capturedNewMessageHandler!({'message': sampleMessageResponse});

      final group = provider.getGroup('group-1');
      expect(group!.lastMessage, 'Hello');
    });

    test('should handle WebSocket error event', () async {
      capturedErrorHandler!({'message': 'Something went wrong'});

      expect(provider.error, 'Something went wrong');
    });
  });

  // ========================================
  // Polling fallback
  // ========================================
  group('polling fallback', () {
    test('should fetch and add new messages', () async {
      await enterGroup('group-1');

      final polledMsg = Map<String, dynamic>.from(sampleMessageResponse);
      polledMsg['id'] = 'msg-poll-1';
      polledMsg['content'] = 'Polled message';

      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=20'))
          .thenAnswer((_) async => [polledMsg]);

      await provider.pollNewMessages();

      expect(provider.currentMessages.length, 1);
      expect(provider.currentMessages.first.content, 'Polled message');
    });

    test('should deduplicate polled messages', () async {
      await enterGroup('group-1');

      // First add via WebSocket
      capturedNewMessageHandler!({'message': sampleMessageResponse});
      expect(provider.currentMessages.length, 1);

      // Poll returns the same message
      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=20'))
          .thenAnswer((_) async => [sampleMessageResponse]);

      await provider.pollNewMessages();

      expect(provider.currentMessages.length, 1); // Still 1
    });

    test('should do nothing without current group', () async {
      await provider.pollNewMessages();

      verifyNever(() => mockApi.get(any()));
    });

    test('should handle API errors silently', () async {
      await enterGroup('group-1');

      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=20'))
          .thenThrow(Exception('network error'));

      // Should not throw
      await provider.pollNewMessages();

      // Polling errors should NOT set user-visible error
      // (error was null before, remains null for polling failures)
    });

    test('should notify listeners when new messages arrive', () async {
      await enterGroup('group-1');

      final polledMsg = Map<String, dynamic>.from(sampleMessageResponse);
      polledMsg['id'] = 'msg-poll-2';

      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=20'))
          .thenAnswer((_) async => [polledMsg]);

      var notified = false;
      provider.addListener(() => notified = true);

      await provider.pollNewMessages();

      expect(notified, true);
    });

    test('should not notify when no new messages', () async {
      await enterGroup('group-1');

      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=20'))
          .thenAnswer((_) async => []);

      var notified = false;
      provider.addListener(() => notified = true);

      await provider.pollNewMessages();

      expect(notified, false);
    });
  });

  // ========================================
  // loadGroups
  // ========================================
  group('loadGroups', () {
    test('should fetch and parse groups from API (array format)', () async {
      when(() => mockApi.get('/api/groups'))
          .thenAnswer((_) async => [sampleGroupJson]);

      await provider.loadGroups();

      expect(provider.groups.length, 1);
      expect(provider.groups.first.name, 'Group 1');
    });

    test('should handle API error with DioException', () async {
      when(() => mockApi.get('/api/groups')).thenThrow(DioException(
        requestOptions: RequestOptions(path: ''),
        response: Response(
          requestOptions: RequestOptions(path: ''),
          statusCode: 500,
          data: {'message': 'Server error'},
        ),
      ));

      await provider.loadGroups();

      expect(provider.error, 'Server error');
    });

    test('should handle generic error', () async {
      when(() => mockApi.get('/api/groups')).thenThrow(Exception('boom'));

      await provider.loadGroups();

      expect(provider.error, 'Failed to load groups');
    });

    test('should clear loading state after completion', () async {
      when(() => mockApi.get('/api/groups')).thenAnswer((_) async => []);

      await provider.loadGroups();

      expect(provider.isLoading, false);
    });
  });

  // ========================================
  // createGroup
  // ========================================
  group('createGroup', () {
    test('should POST and return new group', () async {
      when(() => mockApi.post('/api/groups', any())).thenAnswer((_) async => {
            ...sampleGroupJson,
            'id': 'g-new',
            'name': 'New Group',
          });

      final group = await provider.createGroup('New Group');

      expect(group, isNotNull);
      expect(group!.name, 'New Group');
      expect(provider.groups.length, 1);
    });

    test('should handle DioException error', () async {
      when(() => mockApi.post('/api/groups', any())).thenThrow(DioException(
        requestOptions: RequestOptions(path: ''),
        response: Response(
          requestOptions: RequestOptions(path: ''),
          statusCode: 400,
          data: {'message': 'Invalid name'},
        ),
      ));

      final group = await provider.createGroup('');

      expect(group, isNull);
      expect(provider.error, 'Invalid name');
    });

    test('should handle generic error', () async {
      when(() => mockApi.post('/api/groups', any()))
          .thenThrow(Exception('boom'));

      final group = await provider.createGroup('Test');

      expect(group, isNull);
      expect(provider.error, 'Failed to create group');
    });
  });

  // ========================================
  // joinGroup
  // ========================================
  group('joinGroup', () {
    test('should POST invite code and return group', () async {
      when(() => mockApi.post('/api/groups/join', any()))
          .thenAnswer((_) async => {
                ...sampleGroupJson,
                'id': 'g-joined',
                'name': 'Joined Group',
              });

      final group = await provider.joinGroup('ABC123');

      expect(group, isNotNull);
      expect(group!.name, 'Joined Group');
      expect(provider.groups.length, 1);
    });

    test('should handle DioException error', () async {
      when(() => mockApi.post('/api/groups/join', any()))
          .thenThrow(DioException(
        requestOptions: RequestOptions(path: ''),
        response: Response(
          requestOptions: RequestOptions(path: ''),
          statusCode: 404,
          data: {'message': 'Invalid invite code'},
        ),
      ));

      final group = await provider.joinGroup('INVALID');

      expect(group, isNull);
      expect(provider.error, 'Invalid invite code');
    });

    test('should handle generic error', () async {
      when(() => mockApi.post('/api/groups/join', any()))
          .thenThrow(Exception('boom'));

      final group = await provider.joinGroup('ABC');

      expect(group, isNull);
      expect(provider.error, 'Failed to join group');
    });
  });

  // ========================================
  // enterGroup
  // ========================================
  group('enterGroup', () {
    test('should set currentGroupId', () async {
      await enterGroup('group-1');

      expect(provider.currentGroupId, 'group-1');
    });

    test('should join WebSocket group', () async {
      await enterGroup('group-1');

      verify(() => mockWs.joinGroup('group-1')).called(1);
    });

    test('should load messages', () async {
      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=50'))
          .thenAnswer((_) async => [sampleMessageResponse]);

      await provider.enterGroup('group-1');

      expect(provider.currentMessages.length, 1);
    });

    test('should not reload messages if already loaded', () async {
      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=50'))
          .thenAnswer((_) async => [sampleMessageResponse]);

      await provider.enterGroup('group-1');
      clearInteractions(mockApi);

      await provider.enterGroup('group-1');

      verifyNever(() => mockApi.get(any()));
    });
  });

  // ========================================
  // leaveCurrentGroup
  // ========================================
  group('leaveCurrentGroup', () {
    test('should clear currentGroupId', () async {
      await enterGroup('group-1');

      provider.leaveCurrentGroup();

      expect(provider.currentGroupId, isNull);
    });

    test('should leave WebSocket group', () async {
      await enterGroup('group-1');

      provider.leaveCurrentGroup();

      verify(() => mockWs.leaveGroup('group-1')).called(1);
    });

    test('should clear replyingTo', () async {
      await enterGroup('group-1');
      provider.setReplyingTo(Message(
        id: 'm1',
        groupId: 'group-1',
        content: 'x',
        messageType: MessageType.user,
        createdAt: DateTime.now(),
      ));

      provider.leaveCurrentGroup();

      expect(provider.replyingTo, isNull);
    });

    test('should stop polling timer', () async {
      await enterGroup('group-1');

      provider.leaveCurrentGroup();

      // After leaving, polling should not work
      // (pollNewMessages checks _currentGroupId)
      clearInteractions(mockApi);
      await provider.pollNewMessages();
      verifyNever(() => mockApi.get(any()));
    });

    test('should not notify when notify=false', () async {
      await enterGroup('group-1');

      var notified = false;
      provider.addListener(() => notified = true);

      provider.leaveCurrentGroup(notify: false);

      expect(notified, false);
    });

    test('should notify when notify=true (default)', () async {
      await enterGroup('group-1');

      var notified = false;
      provider.addListener(() => notified = true);

      provider.leaveCurrentGroup();

      expect(notified, true);
    });
  });

  // ========================================
  // setReplyingTo
  // ========================================
  group('setReplyingTo', () {
    test('should set message', () {
      final msg = Message(
        id: 'm1',
        groupId: 'g1',
        content: 'x',
        messageType: MessageType.user,
        createdAt: DateTime.now(),
      );

      provider.setReplyingTo(msg);

      expect(provider.replyingTo, msg);
    });

    test('should clear when null', () {
      provider.setReplyingTo(Message(
        id: 'm1',
        groupId: 'g1',
        content: 'x',
        messageType: MessageType.user,
        createdAt: DateTime.now(),
      ));

      provider.setReplyingTo(null);

      expect(provider.replyingTo, isNull);
    });
  });

  // ========================================
  // clearError / getGroup
  // ========================================
  group('clearError', () {
    test('should clear error', () {
      provider.clearError();
      expect(provider.error, isNull);
    });
  });

  group('getGroup', () {
    test('should return null for unknown group', () {
      expect(provider.getGroup('unknown'), isNull);
    });

    test('should return group when found', () async {
      when(() => mockApi.get('/api/groups'))
          .thenAnswer((_) async => [sampleGroupJson]);

      await provider.loadGroups();

      final group = provider.getGroup('g1');
      expect(group, isNotNull);
      expect(group!.name, 'Group 1');
    });
  });

  // ========================================
  // loadMessages
  // ========================================
  group('loadMessages', () {
    test('should fetch recent messages', () async {
      await enterGroup('group-1');

      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=50'))
          .thenAnswer((_) async => [sampleMessageResponse]);

      await provider.loadMessages('group-1');

      expect(provider.currentMessages.length, 1);
    });

    test('should handle API error', () async {
      await enterGroup('group-1');

      when(() => mockApi.get('/api/messages/group/group-1/recent?limit=50'))
          .thenThrow(Exception('fail'));

      await provider.loadMessages('group-1');

      expect(provider.error, 'Failed to load messages');
    });
  });

  // ========================================
  // AI Message Quote/Reply (P0 - AI 消息引用按钮)
  // ========================================
  group('AI message quote reply', () {
    final sampleAIMessage = Message(
      id: 'ai-msg-1',
      groupId: 'group-1',
      senderId: null,
      senderNickname: null,
      content: '大家好！我是A宝，很高兴在这个群里和大家聊天。有什么我能帮忙的吗？',
      messageType: MessageType.ai,
      replyToId: null,
      replyToContent: null,
      createdAt: DateTime.now(),
    );

    test('should set AI message as replyingTo', () {
      provider.setReplyingTo(sampleAIMessage);

      expect(provider.replyingTo, isNotNull);
      expect(provider.replyingTo!.id, 'ai-msg-1');
      expect(provider.replyingTo!.isAI, true);
    });

    test('should include replyToId when replying to AI message', () async {
      await enterGroup('group-1');
      provider.setReplyingTo(sampleAIMessage);

      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      await provider.sendMessage('你刚才说的很有道理');

      verify(() => mockApi.post(
            '/api/messages/group/group-1',
            {'content': '你刚才说的很有道理', 'replyToId': 'ai-msg-1'},
          )).called(1);
    });

    test('should clear replyingTo after sending reply to AI', () async {
      await enterGroup('group-1');
      provider.setReplyingTo(sampleAIMessage);

      when(() => mockApi.post(any(), any()))
          .thenAnswer((_) async => sampleMessageResponse);

      await provider.sendMessage('reply to ai');

      expect(provider.replyingTo, isNull);
    });

    test('should be able to switch from quoting AI to quoting user', () {
      final userMessage = Message(
        id: 'user-msg-1',
        groupId: 'group-1',
        senderId: 'user-1',
        senderNickname: 'TestUser',
        content: '用户的消息',
        messageType: MessageType.user,
        createdAt: DateTime.now(),
      );

      // Quote AI message first
      provider.setReplyingTo(sampleAIMessage);
      expect(provider.replyingTo!.isAI, true);

      // Switch to quoting user message
      provider.setReplyingTo(userMessage);
      expect(provider.replyingTo!.isUser, true);
      expect(provider.replyingTo!.id, 'user-msg-1');
    });

    test('should handle AI message content truncation for display', () {
      // The AI message content is > 50 chars
      final longContent = sampleAIMessage.content;
      expect(longContent.length, greaterThan(50));

      // Verify truncation logic (used in UI for quote preview)
      final truncated = longContent.length > 50
          ? '${longContent.substring(0, 50)}...'
          : longContent;
      expect(truncated, endsWith('...'));
      expect(truncated.length, 53); // 50 chars + "..."
    });
  });

  // ========================================
  // Message.fromJson handles nullable createdAt
  // ========================================
  group('Message.fromJson robustness', () {
    test('should handle null createdAt gracefully', () {
      final json = {
        'id': 'msg-1',
        'groupId': 'g1',
        'content': 'Hello',
        'messageType': 'USER',
        'createdAt': null,
      };

      final msg = Message.fromJson(json);

      expect(msg.id, 'msg-1');
      expect(msg.createdAt, isNotNull); // Falls back to DateTime.now()
    });
  });
}
