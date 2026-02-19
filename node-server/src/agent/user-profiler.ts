import { query } from '../db/client.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const PROFILES_BASE_DIR = 'storage/profiles';

interface UserProfile {
  nickname: string;
  traits: string[];       // 从聊天中提取的标签，如 "程序员", "喜欢Python"
  updatedAt: string;
}

interface GroupProfiles {
  [userId: string]: UserProfile;
}

// 内存缓存: groupId → profiles
const profileCache = new Map<string, GroupProfiles>();

/**
 * P2: 用户画像自动生成
 *
 * 从群聊历史中提取每个用户的特征标签。
 * 不用 LLM，纯规则提取，零成本。
 */

// 兴趣/身份关键词映射
const TRAIT_PATTERNS: [RegExp, string][] = [
  // 技术栈
  [/\b(?:python|py|pandas|numpy)\b/i, '用Python'],
  [/\b(?:javascript|js|typescript|ts|node|react|vue)\b/i, '用JS/TS'],
  [/\b(?:java|spring|springboot)\b/i, '用Java'],
  [/\b(?:go|golang)\b/i, '用Go'],
  [/\b(?:rust)\b/i, '用Rust'],
  [/\b(?:swift|ios|xcode)\b/i, 'iOS开发'],
  [/\b(?:flutter|dart)\b/i, '用Flutter'],
  [/\b(?:sql|数据库|mysql|postgres|redis)\b/i, '搞数据库'],
  [/\b(?:ai|机器学习|深度学习|大模型|llm|gpt|claude)\b/i, '关注AI'],
  [/\b(?:docker|k8s|kubernetes|devops|cicd)\b/i, '搞运维'],
  // 职业
  [/(?:程序员|写代码|开发|码农|工程师|coder|dev)/, '程序员'],
  [/(?:产品经理|产品|pm\b)/, '产品经理'],
  [/(?:设计师|设计|ui|ux)/, '设计师'],
  [/(?:运营|市场|marketing)/, '运营'],
  [/(?:学生|大学|考研|考试|毕业)/, '学生'],
  // 兴趣
  [/(?:游戏|打游戏|steam|ps5|switch|lol|王者)/, '玩游戏'],
  [/(?:电影|看片|netflix|追剧|剧荒)/, '看剧'],
  [/(?:健身|跑步|撸铁|keep|运动)/, '健身'],
  [/(?:旅游|旅行|出去玩|度假|机票)/, '爱旅行'],
  [/(?:摄影|拍照|相机|镜头)/, '摄影'],
  [/(?:读书|看书|kindle|书单|阅读)/, '爱读书'],
  [/(?:做饭|烹饪|下厨|食谱|烘焙)/, '会做饭'],
  [/(?:猫|喵|铲屎|撸猫)/, '养猫'],
  [/(?:狗|汪|遛狗|柯基|金毛)/, '养狗'],
  [/(?:咖啡|拿铁|美式|手冲)/, '咖啡爱好者'],
];

// 从消息列表中提取特征
function extractTraits(messages: string[]): string[] {
  const traitSet = new Set<string>();
  const combined = messages.join(' ');

  for (const [pattern, trait] of TRAIT_PATTERNS) {
    if (pattern.test(combined)) {
      traitSet.add(trait);
    }
  }

  return Array.from(traitSet).slice(0, 8); // 最多 8 个标签
}

// 获取画像文件路径
function getProfilePath(groupId: string): string {
  return path.join(PROFILES_BASE_DIR, groupId, 'profiles.json');
}

// 从磁盘加载画像
async function loadProfiles(groupId: string): Promise<GroupProfiles> {
  if (profileCache.has(groupId)) {
    return profileCache.get(groupId)!;
  }
  try {
    const raw = await fs.readFile(getProfilePath(groupId), 'utf-8');
    const profiles = JSON.parse(raw) as GroupProfiles;
    profileCache.set(groupId, profiles);
    return profiles;
  } catch {
    return {};
  }
}

// 保存画像到磁盘
async function saveProfiles(groupId: string, profiles: GroupProfiles): Promise<void> {
  const filePath = getProfilePath(groupId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(profiles, null, 2), 'utf-8');
  profileCache.set(groupId, profiles);
}

/**
 * 更新群组中所有用户的画像
 *
 * 从最近 7 天的消息中提取特征。
 * 设计为低频调用（如每次 AI 被触发时）。
 */
export async function updateGroupProfiles(groupId: string): Promise<void> {
  try {
    const result = await query<{
      sender_id: string;
      nickname: string | null;
      email: string | null;
      content: string;
    }>(
      `SELECT m.sender_id, u.nickname, u.email, m.content
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.group_id = $1
         AND m.message_type = 'USER'
         AND m.created_at >= NOW() - INTERVAL '7 days'
       ORDER BY m.created_at DESC
       LIMIT 500`,
      [groupId],
    );

    if (result.rows.length === 0) return;

    // 按用户分组消息
    const userMessages = new Map<string, { nickname: string; messages: string[] }>();
    for (const row of result.rows) {
      const name = row.nickname ?? (row.email ? row.email.split('@')[0] : 'Unknown');
      if (!userMessages.has(row.sender_id)) {
        userMessages.set(row.sender_id, { nickname: name, messages: [] });
      }
      userMessages.get(row.sender_id)!.messages.push(row.content);
    }

    // 提取特征，合并已有画像
    const existing = await loadProfiles(groupId);
    const updated: GroupProfiles = { ...existing };

    for (const [userId, data] of userMessages) {
      const newTraits = extractTraits(data.messages);
      const oldTraits = existing[userId]?.traits || [];
      // 合并去重，新的在前
      const merged = Array.from(new Set([...newTraits, ...oldTraits])).slice(0, 10);
      updated[userId] = {
        nickname: data.nickname,
        traits: merged,
        updatedAt: new Date().toISOString().split('T')[0],
      };
    }

    await saveProfiles(groupId, updated);
    logger.debug({ groupId, userCount: userMessages.size }, '用户画像已更新');
  } catch (err) {
    logger.warn({ err, groupId }, '用户画像更新失败（非关键）');
  }
}

/**
 * 获取群组用户画像摘要，注入 system prompt
 */
export async function getProfileSummary(groupId: string): Promise<string> {
  const profiles = await loadProfiles(groupId);
  const entries = Object.values(profiles);
  if (entries.length === 0) return '';

  const lines = entries
    .filter((p) => p.traits.length > 0)
    .map((p) => `- ${p.nickname}: ${p.traits.join('、')}`);

  if (lines.length === 0) return '';
  return '用户画像:\n' + lines.join('\n');
}
