import 'package:flutter_test/flutter_test.dart';
import 'package:abao_app/main.dart';

void main() {
  testWidgets('App should start and show splash screen', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const AbaoApp());

    // Verify that splash screen is displayed
    expect(find.text('A宝'), findsOneWidget);
    expect(find.text('让每群人都能AI聊天'), findsOneWidget);
  });
}
