enum MessageType { user, ai, system }

class Message {
  final String id;
  final String groupId;
  final String? senderId;
  final String? senderNickname;
  final String content;
  final MessageType messageType;
  final String? replyToId;
  final String? replyToContent;
  final DateTime createdAt;

  Message({
    required this.id,
    required this.groupId,
    this.senderId,
    this.senderNickname,
    required this.content,
    required this.messageType,
    this.replyToId,
    this.replyToContent,
    required this.createdAt,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'],
      groupId: json['groupId'],
      senderId: json['senderId'],
      senderNickname: json['senderNickname'],
      content: json['content'],
      messageType: _parseMessageType(json['messageType']),
      replyToId: json['replyToId'],
      replyToContent: json['replyToContent'],
      createdAt: DateTime.parse(json['createdAt']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'groupId': groupId,
      'senderId': senderId,
      'senderNickname': senderNickname,
      'content': content,
      'messageType': messageType.name.toUpperCase(),
      'replyToId': replyToId,
      'replyToContent': replyToContent,
      'createdAt': createdAt.toIso8601String(),
    };
  }

  static MessageType _parseMessageType(String? type) {
    switch (type?.toUpperCase()) {
      case 'AI':
        return MessageType.ai;
      case 'SYSTEM':
        return MessageType.system;
      default:
        return MessageType.user;
    }
  }

  bool get isAI => messageType == MessageType.ai;
  bool get isSystem => messageType == MessageType.system;
  bool get isUser => messageType == MessageType.user;
}
