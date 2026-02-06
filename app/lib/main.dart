import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/chat_provider.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/auth/login_screen.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AbaoApp());
}

class AbaoApp extends StatefulWidget {
  const AbaoApp({super.key});

  @override
  State<AbaoApp> createState() => _AbaoAppState();
}

class _AbaoAppState extends State<AbaoApp> {
  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => ChatProvider()),
      ],
      child: _SessionExpiryHandler(
        child: MaterialApp(
          navigatorKey: navigatorKey,
          title: 'A宝',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF1890FF),
              brightness: Brightness.light,
            ),
            useMaterial3: true,
            fontFamily: 'System',
          ),
          home: const SplashScreen(),
        ),
      ),
    );
  }
}

/// Listens to AuthProvider and redirects to login when session expires.
class _SessionExpiryHandler extends StatefulWidget {
  final Widget child;
  const _SessionExpiryHandler({required this.child});

  @override
  State<_SessionExpiryHandler> createState() => _SessionExpiryHandlerState();
}

class _SessionExpiryHandlerState extends State<_SessionExpiryHandler> {
  AuthProvider? _authProvider;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final authProvider = Provider.of<AuthProvider>(context);

    if (_authProvider != authProvider) {
      _authProvider = authProvider;
      authProvider.addListener(_onAuthChanged);
    }
  }

  void _onAuthChanged() {
    final authProvider = _authProvider;
    if (authProvider == null) return;

    if (authProvider.status == AuthStatus.unauthenticated &&
        authProvider.errorMessage != null &&
        authProvider.errorMessage!.contains('过期')) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        navigatorKey.currentState?.pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (_) => false,
        );

        final context = navigatorKey.currentContext;
        if (context != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('会话已过期，请重新登录'),
              backgroundColor: Colors.orange,
            ),
          );
        }

        // Clear the error so it doesn't re-trigger
        authProvider.clearError();
      });
    }
  }

  @override
  void dispose() {
    _authProvider?.removeListener(_onAuthChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
