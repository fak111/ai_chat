import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../models/group.dart';
import '../models/message.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';

class ChatProvider extends ChangeNotifier {
  final ApiService _api;
  final WebSocketService _ws;

  List<Group> _groups = [];
  final Map<String, List<Message>> _messages = {};
  String? _currentGroupId;
  bool _isLoading = false;
  String? _error;
  Message? _replyingTo;
  Timer? _pollingTimer;

  List<Group> get groups => _groups;
  List<Message> get currentMessages =>
      _currentGroupId != null ? (_messages[_currentGroupId] ?? []) : [];
  String? get currentGroupId => _currentGroupId;
  bool get isLoading => _isLoading;
  String? get error => _error;
  Message? get replyingTo => _replyingTo;

  ChatProvider()
      : _api = ApiService(),
        _ws = WebSocketService() {
    _setupWebSocketHandlers();
  }

  /// Test constructor - inject dependencies for mocking.
  ChatProvider.forTest({required ApiService api, required WebSocketService ws})
      : _api = api,
        _ws = ws {
    _setupWebSocketHandlers();
  }

  void _setupWebSocketHandlers() {
    _ws.addHandler('NEW_MESSAGE', _handleNewMessage);
    _ws.addHandler('ERROR', _handleError);
  }

  void _handleNewMessage(Map<String, dynamic> data) {
    final messageData = data['message'] as Map<String, dynamic>;
    final message = Message.fromJson(messageData);

    final groupId = message.groupId;
    _messages.putIfAbsent(groupId, () => []);

    // Dedup: skip if message with same ID already exists
    if (_messages[groupId]!.any((m) => m.id == message.id)) return;

    _messages[groupId]!.insert(0, message);

    // Update group's last message
    final groupIndex = _groups.indexWhere((g) => g.id == groupId);
    if (groupIndex != -1) {
      _groups[groupIndex] = _groups[groupIndex].copyWith(
        lastMessage: message.content,
        lastMessageAt: message.createdAt,
      );
    }

    notifyListeners();
  }

  void _handleError(Map<String, dynamic> data) {
    _error = data['message'] as String?;
    notifyListeners();
  }

  Future<void> loadGroups() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.get('/api/groups');
      // API returns array directly
      final List<dynamic> groupsData =
          response is List ? response : (response['groups'] ?? []);
      _groups = groupsData.map((g) => Group.fromJson(g)).toList();
    } on DioException catch (e) {
      _error = e.response?.data?['message'] ?? 'Failed to load groups';
    } catch (e) {
      _error = 'Failed to load groups';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<Group?> createGroup(String name) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _api.post('/api/groups', {'name': name});
      final group = Group.fromJson(response);
      _groups.insert(0, group);
      notifyListeners();
      return group;
    } on DioException catch (e) {
      _error = e.response?.data?['message'] ?? 'Failed to create group';
      notifyListeners();
      return null;
    } catch (e) {
      _error = 'Failed to create group';
      notifyListeners();
      return null;
    } finally {
      _isLoading = false;
    }
  }

  Future<Group?> joinGroup(String inviteCode) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response =
          await _api.post('/api/groups/join', {'inviteCode': inviteCode});
      final group = Group.fromJson(response);
      _groups.insert(0, group);
      notifyListeners();
      return group;
    } on DioException catch (e) {
      _error = e.response?.data?['message'] ?? 'Failed to join group';
      notifyListeners();
      return null;
    } catch (e) {
      _error = 'Failed to join group';
      notifyListeners();
      return null;
    } finally {
      _isLoading = false;
    }
  }

  Future<void> enterGroup(String groupId) async {
    _currentGroupId = groupId;
    _ws.joinGroup(groupId);

    // Load messages if not loaded
    if (!_messages.containsKey(groupId)) {
      await loadMessages(groupId);
    }

    _startPolling();
    notifyListeners();
  }

  void leaveCurrentGroup({bool notify = true}) {
    if (_currentGroupId != null) {
      _ws.leaveGroup(_currentGroupId!);
      _currentGroupId = null;
      _replyingTo = null;
      _stopPolling();
      if (notify) {
        notifyListeners();
      }
    }
  }

  Future<void> loadMessages(String groupId, {bool loadMore = false}) async {
    _isLoading = true;
    notifyListeners();

    try {
      final response =
          await _api.get('/api/messages/group/$groupId/recent?limit=50');
      final List<dynamic> messagesData =
          response is List ? response : (response['content'] ?? []);
      final messages = messagesData.map((m) => Message.fromJson(m)).toList();

      if (loadMore) {
        _messages[groupId]?.addAll(messages);
      } else {
        _messages[groupId] = messages;
      }
    } catch (e) {
      _error = 'Failed to load messages';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Send a message via HTTP POST (reliable, with error feedback).
  /// Returns true on success, false on failure.
  Future<bool> sendMessage(String content) async {
    if (_currentGroupId == null || content.trim().isEmpty) return false;

    try {
      final data = <String, dynamic>{
        'content': content.trim(),
        if (_replyingTo != null) 'replyToId': _replyingTo!.id,
      };

      final response =
          await _api.post('/api/messages/group/$_currentGroupId', data);
      final message = Message.fromJson(response);

      // Add to local list immediately (dedup protects against WebSocket duplicate)
      _messages.putIfAbsent(_currentGroupId!, () => []);
      if (!_messages[_currentGroupId!]!.any((m) => m.id == message.id)) {
        _messages[_currentGroupId!]!.insert(0, message);
      }

      _replyingTo = null;
      notifyListeners();
      return true;
    } on DioException catch (e) {
      _error = e.response?.data?['error'] ??
          e.response?.data?['message'] ??
          'Failed to send message';
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'Failed to send message';
      notifyListeners();
      return false;
    }
  }

  /// Poll for new messages via HTTP. Called by timer when WebSocket is down,
  /// or can be called manually.
  Future<void> pollNewMessages() async {
    if (_currentGroupId == null) return;

    try {
      final response =
          await _api.get('/api/messages/group/$_currentGroupId/recent?limit=20');
      final List<dynamic> messagesData = response is List ? response : [];
      final messages = messagesData.map((m) => Message.fromJson(m)).toList();

      bool hasNew = false;
      _messages.putIfAbsent(_currentGroupId!, () => []);
      for (final message in messages) {
        if (!_messages[_currentGroupId!]!.any((m) => m.id == message.id)) {
          _messages[_currentGroupId!]!.insert(0, message);
          hasNew = true;
        }
      }

      if (hasNew) notifyListeners();
    } catch (_) {
      // Silent failure for polling - don't set user-visible error
    }
  }

  void _startPolling() {
    _stopPolling();
    // Always poll as a safety net. Dedup logic prevents duplicate messages.
    // WebSocket provides real-time delivery; polling catches anything missed.
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_currentGroupId != null) {
        pollNewMessages();
      }
    });
  }

  void _stopPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
  }

  void setReplyingTo(Message? message) {
    _replyingTo = message;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  Group? getGroup(String groupId) {
    return _groups.where((g) => g.id == groupId).firstOrNull;
  }

  @override
  void dispose() {
    _stopPolling();
    _ws.disconnect();
    super.dispose();
  }
}
