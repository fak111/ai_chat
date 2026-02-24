enum StreamingPhase { thinking, toolUsing, streaming, done }

class StreamingMessage {
  final String streamId;
  final String groupId;
  final String replyToId;
  String content;
  StreamingPhase phase;
  String? activeToolName;

  StreamingMessage({
    required this.streamId,
    required this.groupId,
    required this.replyToId,
    this.content = '',
    this.phase = StreamingPhase.thinking,
    this.activeToolName,
  });
}
