import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../models/group.dart';
import '../models/message.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';

class ChatProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  final WebSocketService _ws = WebSocketService();

  List<Group> _groups = [];
  final Map<String, List<Message>> _messages = {};
  String? _currentGroupId;
  bool _isLoading = false;
  String? _error;
  Message? _replyingTo;

  List<Group> get groups => _groups;
  List<Message> get currentMessages =>
      _currentGroupId != null ? (_messages[_currentGroupId] ?? []) : [];
  String? get currentGroupId => _currentGroupId;
  bool get isLoading => _isLoading;
  String? get error => _error;
  Message? get replyingTo => _replyingTo;

  ChatProvider() {
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
      final List<dynamic> groupsData = response is List ? response : (response['groups'] ?? []);
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
      final response = await _api.post('/api/groups/join', {'inviteCode': inviteCode});
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

    notifyListeners();
  }

  void leaveCurrentGroup() {
    if (_currentGroupId != null) {
      _ws.leaveGroup(_currentGroupId!);
      _currentGroupId = null;
      _replyingTo = null;
      notifyListeners();
    }
  }

  Future<void> loadMessages(String groupId, {bool loadMore = false}) async {
    _isLoading = true;
    notifyListeners();

    try {
      final page = loadMore ? (_messages[groupId]?.length ?? 0) ~/ 50 : 0;
      final response = await _api.get('/api/messages/group/$groupId/recent?limit=50');
      final List<dynamic> messagesData = response is List ? response : (response['content'] ?? []);
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

  void sendMessage(String content) {
    if (_currentGroupId == null || content.trim().isEmpty) return;

    _ws.sendMessage(
      _currentGroupId!,
      content.trim(),
      replyToId: _replyingTo?.id,
    );

    _replyingTo = null;
    notifyListeners();
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
    _ws.disconnect();
    super.dispose();
  }
}
