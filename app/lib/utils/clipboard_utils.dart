import 'package:flutter/services.dart';

/// Result of a clipboard copy operation.
class ClipboardResult {
  final bool success;
  final String? errorMessage;

  const ClipboardResult.success() : success = true, errorMessage = null;
  const ClipboardResult.failure(this.errorMessage) : success = false;
}

/// Safely copy [text] to the system clipboard.
///
/// Returns [ClipboardResult] indicating success or failure.
/// On mobile WebView, clipboard API may silently fail due to:
/// - Missing secure context (non-HTTPS)
/// - Permission denied
/// - User activation required
Future<ClipboardResult> copyToClipboard(String text) async {
  if (text.isEmpty) {
    return const ClipboardResult.failure('复制内容为空');
  }

  try {
    await Clipboard.setData(ClipboardData(text: text));
    return const ClipboardResult.success();
  } catch (e) {
    return ClipboardResult.failure('复制失败: $e');
  }
}
