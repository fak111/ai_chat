enum ChangeType { feat, fix, refactor, perf, ci, docs, chore }

class ChangeItem {
  final ChangeType type;
  final String description;

  const ChangeItem({required this.type, required this.description});

  String get emoji {
    switch (type) {
      case ChangeType.feat:
        return '\u2728'; // ✨
      case ChangeType.fix:
        return '\uD83D\uDC1B'; // 🐛
      case ChangeType.refactor:
        return '\u267B\uFE0F'; // ♻️
      case ChangeType.perf:
        return '\u26A1'; // ⚡
      case ChangeType.ci:
        return '\uD83D\uDE80'; // 🚀
      case ChangeType.docs:
        return '\uD83D\uDCDD'; // 📝
      case ChangeType.chore:
        return '\uD83D\uDD27'; // 🔧
    }
  }

  String get label {
    switch (type) {
      case ChangeType.feat:
        return '新功能';
      case ChangeType.fix:
        return '修复';
      case ChangeType.refactor:
        return '重构';
      case ChangeType.perf:
        return '性能';
      case ChangeType.ci:
        return '部署';
      case ChangeType.docs:
        return '文档';
      case ChangeType.chore:
        return '维护';
    }
  }
}

class ChangelogEntry {
  final String version;
  final String date;
  final String summary;
  final List<ChangeItem> changes;

  const ChangelogEntry({
    required this.version,
    required this.date,
    required this.summary,
    required this.changes,
  });
}

const List<ChangelogEntry> changelog = [
  // === /changelog 会在此处头部插入新条目 ===
  ChangelogEntry(
    version: 'v1.0.0216.1',
    date: '2026-02-16',
    summary: '新增 App 内更新日志页面，支持卡片式时间线浏览版本更新',
    changes: [
      ChangeItem(type: ChangeType.feat, description: '新增卡片式时间线更新日志页面，展示每个版本的变更详情'),
      ChangeItem(type: ChangeType.feat, description: '新增更新日志数据模型，支持 feat/fix/refactor 等分类标签'),
      ChangeItem(type: ChangeType.feat, description: '设置页版本信息改为动态读取，点击可查看完整更新日志'),
      ChangeItem(type: ChangeType.chore, description: '新增 /changelog skill，一键生成发版日志并自动 commit + tag'),
    ],
  ),
  ChangelogEntry(
    version: 'v1.0.0215.1',
    date: '2025-02-15',
    summary: 'CI/CD 流水线上线，自动化构建与部署',
    changes: [
      ChangeItem(type: ChangeType.ci, description: '重写 CI/CD 流水线，测试集成到发版流程'),
      ChangeItem(type: ChangeType.ci, description: '零传输部署策略，服务器端 git pull + docker build'),
      ChangeItem(type: ChangeType.fix, description: '修复后端测试与邮箱验证业务逻辑不匹配'),
      ChangeItem(type: ChangeType.fix, description: 'Flutter analyze 不再因 warnings 阻断流水线'),
      ChangeItem(type: ChangeType.chore, description: '将 docker-compose.prod.yml 纳入版本控制'),
    ],
  ),
  ChangelogEntry(
    version: 'v1.0.0',
    date: '2025-02-09',
    summary: 'A宝 MVP 正式发布，核心聊天与 AI 功能上线',
    changes: [
      ChangeItem(type: ChangeType.feat, description: '邮箱注册/登录，JWT 认证体系'),
      ChangeItem(type: ChangeType.feat, description: '创建/加入群聊，邀请码分享'),
      ChangeItem(type: ChangeType.feat, description: 'WebSocket 实时消息推送'),
      ChangeItem(type: ChangeType.feat, description: '@AI 触发回复，引用 AI 消息继续对话'),
      ChangeItem(type: ChangeType.fix, description: '修复 AI 引用追问时回答被引用消息而非当前问题'),
      ChangeItem(type: ChangeType.fix, description: '修复 AI GroupMember user 为 null 导致 NPE'),
      ChangeItem(type: ChangeType.chore, description: '替换全平台 App 图标为 A宝 logo'),
      ChangeItem(type: ChangeType.docs, description: 'E2E 测试报告与截图，前后端单元测试'),
    ],
  ),
];
