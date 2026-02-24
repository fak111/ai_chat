import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../data/changelog.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../auth/login_screen.dart';
import 'changelog_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('设置'),
      ),
      body: ListView(
        children: [
          const SizedBox(height: 16),
          _buildUserHeader(context, user),
          const Divider(height: 32),
          _buildSectionTitle('账号设置'),
          ListTile(
            leading: const Icon(Icons.edit_outlined),
            title: const Text('修改昵称'),
            subtitle: Text(user?.displayName ?? ''),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showEditNicknameDialog(context, user?.displayName ?? ''),
          ),
          ListTile(
            leading: const Icon(Icons.lock_outline),
            title: const Text('修改密码'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              // TODO: Navigate to change password
            },
          ),
          const Divider(height: 32),
          _buildSectionTitle('偏好设置'),
          ListTile(
            leading: const Icon(Icons.palette_outlined),
            title: const Text('主题色'),
            subtitle: const Text('默认蓝'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              // TODO: Navigate to theme settings (P2)
            },
          ),
          ListTile(
            leading: const Icon(Icons.notifications_outlined),
            title: const Text('消息中心'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              // TODO: Navigate to notifications (P2)
            },
          ),
          const Divider(height: 32),
          _buildSectionTitle('关于'),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('版本信息'),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  changelog.first.version,
                  style: const TextStyle(color: Colors.grey),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const ChangelogScreen(),
                ),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.description_outlined),
            title: const Text('用户协议'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              // TODO: Show terms of service
            },
          ),
          ListTile(
            leading: const Icon(Icons.privacy_tip_outlined),
            title: const Text('隐私政策'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              // TODO: Show privacy policy
            },
          ),
          const Divider(height: 32),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton(
              onPressed: () => _showLogoutDialog(context),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
                side: const BorderSide(color: Colors.red),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('退出登录', style: TextStyle(fontSize: 16)),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildUserHeader(BuildContext context, user) {
    final avatarUrl = user?.avatarUrl;
    final String? fullAvatarUrl;
    if (avatarUrl == null) {
      fullAvatarUrl = null;
    } else if (!avatarUrl.startsWith('http')) {
      // 旧的相对路径：/uploads/avatars/...
      fullAvatarUrl = '${ApiService.baseUrl}$avatarUrl';
    } else if (kIsWeb) {
      // Web 端：CDN 无 CORS，通过后端代理加载
      final cdnPrefix = 'https://cdn.swjip.asia/';
      fullAvatarUrl = avatarUrl.startsWith(cdnPrefix)
          ? '${ApiService.baseUrl}/api/v1/cdn/${avatarUrl.substring(cdnPrefix.length)}'
          : avatarUrl;
    } else {
      // 移动/桌面端：直接走 CDN
      fullAvatarUrl = avatarUrl;
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () {
              final changesLeft = user?.avatarChangesLeft ?? 0;
              if (changesLeft <= 0) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('头像修改次数已用完（最多3次）')),
                );
                return;
              }
              _pickAndUploadAvatar(context);
            },
            child: Stack(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                  backgroundImage: fullAvatarUrl != null
                      ? NetworkImage(fullAvatarUrl)
                      : null,
                  onBackgroundImageError: fullAvatarUrl != null
                      ? (_, __) {} // 静默处理加载失败
                      : null,
                  child: avatarUrl == null
                      ? Text(
                          user?.displayName.substring(0, 1).toUpperCase() ?? '?',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        )
                      : null,
                ),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.camera_alt, size: 14, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user?.displayName ?? '未登录',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  user?.email ?? '',
                  style: TextStyle(
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickAndUploadAvatar(BuildContext context) async {
    try {
      final picker = ImagePicker();
      final image = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 80,
      );
      if (image == null) return;

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('上传中...'), duration: Duration(seconds: 1)),
      );

      final bytes = await image.readAsBytes();
      final filename = image.name.isNotEmpty ? image.name : 'avatar.jpg';
      final success = await context.read<AuthProvider>().updateAvatar(bytes.toList(), filename);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? '头像已更新' : '上传失败'),
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('选择图片失败: $e'), duration: const Duration(seconds: 3)),
        );
      }
    }
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: Colors.grey,
        ),
      ),
    );
  }

  void _showEditNicknameDialog(BuildContext context, String currentName) {
    final controller = TextEditingController(text: currentName);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('修改昵称'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 50,
          decoration: const InputDecoration(
            hintText: '输入新昵称',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () async {
              final newName = controller.text.trim();
              if (newName.isEmpty || newName == currentName) {
                Navigator.pop(ctx);
                return;
              }
              Navigator.pop(ctx);
              final success = await context.read<AuthProvider>().updateNickname(newName);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(success ? '昵称已更新' : '修改失败'),
                    duration: const Duration(seconds: 2),
                  ),
                );
              }
            },
            child: const Text('确认'),
          ),
        ],
      ),
    );
  }

  void _showLogoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认退出登录？'),
        content: const Text('退出后需要重新登录才能使用'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              await context.read<AuthProvider>().logout();
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (route) => false,
                );
              }
            },
            child: const Text('确认', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}
