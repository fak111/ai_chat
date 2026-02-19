import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:abao_app/utils/clipboard_utils.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('copyToClipboard', () {
    late String? lastClipboardText;

    setUp(() {
      lastClipboardText = null;
      // Mock the system clipboard channel
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') {
          lastClipboardText =
              (call.arguments as Map)['text'] as String?;
          return null;
        }
        return null;
      });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null);
    });

    test('should return success and write to clipboard for valid text', () async {
      final result = await copyToClipboard('hello');

      expect(result.success, isTrue);
      expect(result.errorMessage, isNull);
      expect(lastClipboardText, equals('hello'));
    });

    test('should return failure for empty text', () async {
      final result = await copyToClipboard('');

      expect(result.success, isFalse);
      expect(result.errorMessage, contains('为空'));
      expect(lastClipboardText, isNull);
    });

    test('should return failure when clipboard API throws', () async {
      // Simulate clipboard permission denied (mobile WebView scenario)
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') {
          throw PlatformException(
            code: 'CLIPBOARD_ERROR',
            message: 'Permission denied',
          );
        }
        return null;
      });

      final result = await copyToClipboard('test text');

      expect(result.success, isFalse);
      expect(result.errorMessage, contains('复制失败'));
    });

    test('should handle invite code with spaces and special chars', () async {
      final result = await copyToClipboard('ABC-123');

      expect(result.success, isTrue);
      expect(lastClipboardText, equals('ABC-123'));
    });
  });
}
