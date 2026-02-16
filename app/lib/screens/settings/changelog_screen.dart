import 'package:flutter/material.dart';
import '../../data/changelog.dart';

class ChangelogScreen extends StatelessWidget {
  const ChangelogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('更新日志'),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        itemCount: changelog.length,
        itemBuilder: (context, index) {
          final entry = changelog[index];
          final isLatest = index == 0;
          final isLast = index == changelog.length - 1;

          return IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 时间线
                SizedBox(
                  width: 32,
                  child: Column(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isLatest
                              ? colorScheme.primary
                              : colorScheme.outline.withAlpha(128),
                        ),
                      ),
                      if (!isLast)
                        Expanded(
                          child: Container(
                            width: 2,
                            color: colorScheme.outline.withAlpha(64),
                          ),
                        ),
                    ],
                  ),
                ),
                // 卡片
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: _buildVersionCard(context, entry, isLatest),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildVersionCard(
    BuildContext context,
    ChangelogEntry entry,
    bool isLatest,
  ) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      elevation: isLatest ? 2 : 0.5,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: isLatest
            ? BorderSide(color: colorScheme.primary.withAlpha(128))
            : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 版本号 + 日期 + 最新标签
            Row(
              children: [
                Text(
                  entry.version,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: isLatest ? colorScheme.primary : null,
                  ),
                ),
                const Spacer(),
                if (isLatest)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: colorScheme.primary,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '最新',
                      style: TextStyle(
                        fontSize: 11,
                        color: colorScheme.onPrimary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              entry.date,
              style: TextStyle(
                fontSize: 13,
                color: colorScheme.outline,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              entry.summary,
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),
            // 变更列表
            ...entry.changes.map(
              (change) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(change.emoji, style: const TextStyle(fontSize: 14)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        change.description,
                        style: const TextStyle(fontSize: 13, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
