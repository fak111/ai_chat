# /changelog — 一键发版日志

自动完成：生成更新日志 → 写入数据文件 → 更新版本号 → git commit → git tag → 提示 push。

## 使用方式

```
/changelog              # 自动推断版本号 (build+1)
/changelog v1.0.0216.2  # 指定版本号
```

## 执行流程

### 1. 确定版本号

- 读取最新 git tag: `git tag -l --sort=-version:refname | head -1`
- 版本格式: `v{major}.{minor}.{MMDD}.{build}`
- 若用户未指定版本号:
  - 同一天: build+1 (如 `v1.0.0216.1` → `v1.0.0216.2`)
  - 不同天: 新日期 build=1 (如 `v1.0.0215.1` → `v1.0.0216.1`)
- 若用户指定了版本号，直接使用

### 2. 获取 commits

```bash
git log {prev_tag}..HEAD --oneline --no-merges
```

如果没有新 commit，提示用户并终止。

### 3. AI 总结

将 commits 总结为用户友好的中文描述：
- 合并相似改动，去掉技术细节
- 每条变更分类: feat/fix/refactor/perf/ci/docs/chore
- 生成一句话 summary 概括本次发版

### 4. 展示草稿，等用户确认

输出格式：

```
📦 版本: v1.0.0216.1
📅 日期: 2026-02-16

📝 概要: xxxxxx

变更列表:
✨ 新功能描述
🐛 修复描述
...

确认发版？(确认后将写入文件、commit、tag)
```

**必须等用户确认后才能继续。**

### 5. 写入 changelog 数据

编辑 `app/lib/data/changelog.dart`，在 `changelog` 列表的 **注释标记行下方** 插入新条目：

```dart
  // === /changelog 会在此处头部插入新条目 ===
  ChangelogEntry(
    version: 'v{version}',
    date: '{YYYY-MM-DD}',
    summary: '{summary}',
    changes: [
      ChangeItem(type: ChangeType.feat, description: '{desc}'),
      ...
    ],
  ),
```

### 6. 更新 pubspec.yaml 版本号

编辑 `app/pubspec.yaml` 的 `version` 字段：
- 格式: `{major}.{minor}.{patch}+{buildNumber}`
- buildNumber 递增（读取当前值 +1）

### 7. Git 操作

```bash
git add app/lib/data/changelog.dart app/pubspec.yaml
git commit -m "release: v{version}"
git tag v{version}
```

### 8. 提示 Push

问用户是否 push：

```
git push origin main --tags
```

## 注意事项

- emoji 在 Dart 中使用 Unicode 转义: `'\u2728'` (✨), `'\uD83D\uDC1B'` (🐛) 等
- 日期使用当天日期，格式 YYYY-MM-DD
- 绝对不要自动 push，必须用户确认
- 此 skill 触发 CI/CD: tag push → GitHub Actions → 自动构建发版
