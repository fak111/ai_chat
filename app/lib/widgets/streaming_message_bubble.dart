import 'package:flutter/material.dart';

import '../models/streaming_message.dart';
import 'typing_indicator.dart';

class StreamingMessageBubble extends StatefulWidget {
  final StreamingMessage streaming;

  const StreamingMessageBubble({super.key, required this.streaming});

  @override
  State<StreamingMessageBubble> createState() => _StreamingMessageBubbleState();
}

class _StreamingMessageBubbleState extends State<StreamingMessageBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _cursorController;

  @override
  void initState() {
    super.initState();
    _cursorController = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _cursorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final streaming = widget.streaming;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: Theme.of(context).colorScheme.secondary,
            child:
                const Icon(Icons.smart_toy, size: 20, color: Colors.white),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Name + phase indicator
                Row(
                  children: [
                    Text(
                      'AI',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    _buildPhaseIndicator(streaming),
                  ],
                ),
                const SizedBox(height: 4),
                // Bubble content
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: streaming.content.isEmpty
                      ? const TypingIndicator()
                      : _buildStreamingText(streaming.content),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhaseIndicator(StreamingMessage streaming) {
    switch (streaming.phase) {
      case StreamingPhase.thinking:
        return Text(
          '正在思考...',
          style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
        );
      case StreamingPhase.toolUsing:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 10,
              height: 10,
              child: CircularProgressIndicator(
                strokeWidth: 1.5,
                color: Colors.orange.shade400,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              '使用 ${streaming.activeToolName ?? ''} 工具...',
              style: TextStyle(fontSize: 11, color: Colors.orange.shade400),
            ),
          ],
        );
      case StreamingPhase.streaming:
        return Text(
          '正在输入...',
          style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
        );
      case StreamingPhase.done:
        return const SizedBox.shrink();
    }
  }

  Widget _buildStreamingText(String content) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: SelectableText(content, style: const TextStyle(fontSize: 15)),
        ),
        FadeTransition(
          opacity: _cursorController,
          child: const Text(
            '\u258E',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }
}
