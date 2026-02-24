import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../main.dart' show initialUri;
import '../../providers/auth_provider.dart';
import '../../utils/auto_login_utils.dart';
import 'login_screen.dart';
import '../chat/chat_list_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    await Future.delayed(const Duration(milliseconds: 1500));

    if (!mounted) return;

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    await authProvider.checkAuthStatus();

    if (!mounted) return;

    if (authProvider.isAuthenticated) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ChatListScreen()),
      );
      return;
    }

    // Auto-login via URL parameter ?auto_login=email:password
    if (kIsWeb) {
      try {
        final autoLoginValue = extractAutoLoginFromUri(initialUri) ?? getAutoLoginFromDartDefine();
        debugPrint('Auto-login: initialUri=$initialUri, value=$autoLoginValue');
        final credentials = parseAutoLoginParam(autoLoginValue);
        if (credentials != null) {
          debugPrint('Auto-login: attempting for ${credentials.email}');
          final success = await authProvider.login(
            credentials.email,
            credentials.password,
          );
          if (!mounted) return;
          if (success) {
            debugPrint('Auto-login: success for ${credentials.email}');
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const ChatListScreen()),
            );
            return;
          }
          debugPrint(
              'Auto-login: failed for ${credentials.email} - ${authProvider.errorMessage}');
        }
      } catch (e) {
        debugPrint('Auto-login error: $e');
      }
    }

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.primary,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Center(
                child: Text(
                  'A宝',
                  style: TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1890FF),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              '让每群人都能AI聊天',
              style: TextStyle(
                fontSize: 18,
                color: Colors.white,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 48),
            const CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}
