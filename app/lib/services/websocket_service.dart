import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'api_service.dart';
import 'token_manager.dart';

typedef MessageHandler = void Function(Map<String, dynamic> message);

class WebSocketService {
  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;

  WebSocketChannel? _channel;
  late final TokenManager _tokenManager;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  bool _isConnected = false;
  bool _shouldReconnect = true;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 5;

  final Map<String, Set<MessageHandler>> _handlers = {};
  final Set<String> _joinedGroups = {};
  void Function()? onReconnect;

  WebSocketService._internal() {
    _tokenManager = TokenManager();
  }

  /// Test constructor — inject dependencies.
  WebSocketService.forTest({required TokenManager tokenManager})
      : _tokenManager = tokenManager;

  bool get isConnected => _isConnected;

  Future<void> connect() async {
    if (_isConnected) return;

    final token = await _tokenManager.getValidAccessToken();
    if (token == null) return;

    _shouldReconnect = true;

    try {
      final wsUrl = Uri.parse('${ApiService.baseUrl.replaceFirst('http', 'ws')}/ws?token=$token');
      _channel = WebSocketChannel.connect(wsUrl);

      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
      );

      final wasReconnect = _reconnectAttempts > 0;
      _isConnected = true;
      _reconnectAttempts = 0;
      _startPingTimer();

      // Rejoin groups
      for (final groupId in _joinedGroups) {
        _sendJoinGroup(groupId);
      }

      // Notify reconnect listeners
      if (wasReconnect) {
        onReconnect?.call();
      }
    } catch (e) {
      _isConnected = false;
      _scheduleReconnect();
    }
  }

  void disconnect() {
    _shouldReconnect = false;
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    _joinedGroups.clear();
  }

  void joinGroup(String groupId) {
    _joinedGroups.add(groupId);
    if (_isConnected) {
      _sendJoinGroup(groupId);
    }
  }

  void leaveGroup(String groupId) {
    _joinedGroups.remove(groupId);
    if (_isConnected) {
      _send({
        'type': 'LEAVE_GROUP',
        'groupId': groupId,
      });
    }
  }

  void sendMessage(String groupId, String content, {String? replyToId}) {
    _send({
      'type': 'SEND_MESSAGE',
      'groupId': groupId,
      'content': content,
      if (replyToId != null) 'replyToId': replyToId,
    });
  }

  void addHandler(String type, MessageHandler handler) {
    _handlers.putIfAbsent(type, () => {});
    _handlers[type]!.add(handler);
  }

  void removeHandler(String type, MessageHandler handler) {
    _handlers[type]?.remove(handler);
  }

  void _sendJoinGroup(String groupId) {
    _send({
      'type': 'JOIN_GROUP',
      'groupId': groupId,
    });
  }

  void _send(Map<String, dynamic> message) {
    if (!_isConnected || _channel == null) return;
    _channel!.sink.add(jsonEncode(message));
  }

  void _onMessage(dynamic data) {
    try {
      final message = jsonDecode(data as String) as Map<String, dynamic>;
      final type = message['type'] as String?;

      if (type == 'PONG') return;

      if (type != null && _handlers.containsKey(type)) {
        for (final handler in _handlers[type]!) {
          handler(message);
        }
      }

      // Also notify "ALL" handlers
      if (_handlers.containsKey('ALL')) {
        for (final handler in _handlers['ALL']!) {
          handler(message);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  void _onError(dynamic error) {
    _isConnected = false;
    _scheduleReconnect();
  }

  void _onDone() {
    _isConnected = false;
    _pingTimer?.cancel();
    if (_shouldReconnect) {
      _scheduleReconnect();
    }
  }

  void _startPingTimer() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _send({'type': 'PING'});
    });
  }

  void _scheduleReconnect() {
    if (!_shouldReconnect || _reconnectAttempts >= _maxReconnectAttempts) return;

    _reconnectTimer?.cancel();
    final delay = Duration(seconds: _reconnectAttempts * 2 + 1);
    _reconnectAttempts++;

    _reconnectTimer = Timer(delay, () {
      connect();
    });
  }
}
