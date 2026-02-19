import { query, getClient } from '../db/client.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.js';
import type { User, Group, GroupDto, GroupDetailDto, GroupMemberDto } from '../types/index.js';

const INVITE_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const INVITE_CODE_LENGTH = 6;
const MAX_INVITE_CODE_RETRIES = 100;

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

function getSenderName(nickname: string | null, email: string | null, messageType: string): string {
  if (messageType === 'AI') return 'AI';
  if (nickname) return nickname;
  if (email) return email.split('@')[0];
  return '未知用户';
}

function formatLastMessage(senderName: string, content: string): string {
  const full = `${senderName}: ${content}`;
  if (full.length > 50) return full.substring(0, 50);
  return full;
}

export async function createGroup(user: User, name: string): Promise<GroupDto> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new BadRequestError('群聊名称不能为空');
  }
  if (trimmedName.length > 50) {
    throw new BadRequestError('群聊名称不能超过50个字符');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let group: Group | null = null;
    for (let attempt = 0; attempt < MAX_INVITE_CODE_RETRIES; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const result = await client.query(
          `INSERT INTO groups (name, invite_code) VALUES ($1, $2)
           RETURNING id, name, invite_code, created_at, updated_at`,
          [trimmedName, inviteCode],
        );
        group = result.rows[0];
        break;
      } catch (err: any) {
        if (err.code === '23505') continue; // unique_violation, retry
        throw err;
      }
    }

    if (!group) {
      throw new Error('无法生成唯一邀请码');
    }

    // Add creator as member
    await client.query(
      `INSERT INTO group_members (group_id, user_id, is_ai) VALUES ($1, $2, false)`,
      [group.id, user.id],
    );

    // Add AI as member
    await client.query(
      `INSERT INTO group_members (group_id, user_id, is_ai) VALUES ($1, NULL, true)`,
      [group.id],
    );

    await client.query('COMMIT');

    return {
      id: group.id,
      name: group.name,
      inviteCode: group.invite_code,
      memberCount: 2,
      createdAt: group.created_at instanceof Date ? group.created_at.toISOString() : String(group.created_at),
      updatedAt: group.updated_at instanceof Date ? group.updated_at.toISOString() : String(group.updated_at),
      lastMessage: null,
      lastMessageAt: null,
      unreadCount: 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function joinGroup(user: User, inviteCode: string): Promise<GroupDto> {
  const code = inviteCode.trim().toUpperCase();

  // Find group by invite code
  const groupResult = await query(
    `SELECT id, name, invite_code, created_at, updated_at FROM groups WHERE invite_code = $1`,
    [code],
  );
  if (groupResult.rows.length === 0) {
    throw new NotFoundError('邀请码无效');
  }
  const group = groupResult.rows[0] as Group;

  // Check if already a member
  const memberResult = await query(
    `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [group.id, user.id],
  );
  if (memberResult.rows.length > 0) {
    throw new ConflictError('您已在该群聊中');
  }

  // Add user as member
  await query(
    `INSERT INTO group_members (group_id, user_id, is_ai) VALUES ($1, $2, false)`,
    [group.id, user.id],
  );

  // Get member count
  const countResult = await query(
    `SELECT COUNT(*) as count FROM group_members WHERE group_id = $1`,
    [group.id],
  );
  const memberCount = parseInt(countResult.rows[0].count, 10);

  // Get last message
  const msgResult = await query(
    `SELECT m.content, m.message_type, m.created_at,
            u.nickname as sender_nickname, u.email as sender_email
     FROM messages m
     LEFT JOIN users u ON m.sender_id = u.id
     WHERE m.group_id = $1
     ORDER BY m.created_at DESC LIMIT 1`,
    [group.id],
  );

  let lastMessage: string | null = null;
  let lastMessageAt: string | null = null;
  if (msgResult.rows.length > 0) {
    const msg = msgResult.rows[0];
    const senderName = getSenderName(msg.sender_nickname, msg.sender_email, msg.message_type);
    lastMessage = formatLastMessage(senderName, msg.content);
    lastMessageAt = msg.created_at instanceof Date ? msg.created_at.toISOString() : String(msg.created_at);
  }

  return {
    id: group.id,
    name: group.name,
    inviteCode: group.invite_code,
    memberCount,
    createdAt: group.created_at instanceof Date ? group.created_at.toISOString() : String(group.created_at),
    updatedAt: group.updated_at instanceof Date ? group.updated_at.toISOString() : String(group.updated_at),
    lastMessage,
    lastMessageAt,
    unreadCount: 0,
  };
}

export async function getUserGroups(user: User): Promise<GroupDto[]> {
  const result = await query(
    `SELECT g.id, g.name, g.invite_code, g.created_at, g.updated_at,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
            lm.content as last_message_content,
            lm_user.nickname as last_message_sender_nickname,
            lm_user.email as last_message_sender_email,
            lm.message_type as last_message_type,
            lm.created_at as last_message_at
     FROM groups g
     INNER JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = $1
     LEFT JOIN LATERAL (
       SELECT m.content, m.sender_id, m.message_type, m.created_at
       FROM messages m WHERE m.group_id = g.id
       ORDER BY m.created_at DESC LIMIT 1
     ) lm ON true
     LEFT JOIN users lm_user ON lm.sender_id = lm_user.id
     ORDER BY g.updated_at DESC`,
    [user.id],
  );

  return result.rows.map((row: any) => {
    let lastMessage: string | null = null;
    let lastMessageAt: string | null = null;

    if (row.last_message_content) {
      const senderName = getSenderName(
        row.last_message_sender_nickname,
        row.last_message_sender_email,
        row.last_message_type,
      );
      lastMessage = formatLastMessage(senderName, row.last_message_content);
      lastMessageAt = row.last_message_at instanceof Date
        ? row.last_message_at.toISOString()
        : String(row.last_message_at);
    }

    return {
      id: row.id,
      name: row.name,
      inviteCode: row.invite_code,
      memberCount: parseInt(row.member_count, 10),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      lastMessage,
      lastMessageAt,
      unreadCount: 0,
    };
  });
}

async function findGroupOrThrow(groupId: string): Promise<Group> {
  const result = await query(
    `SELECT id, name, invite_code, created_at, updated_at FROM groups WHERE id = $1`,
    [groupId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('群聊不存在');
  }
  return result.rows[0] as Group;
}

async function checkMembershipOrThrow(groupId: string, userId: string): Promise<void> {
  const result = await query(
    `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  );
  if (result.rows.length === 0) {
    throw new ForbiddenError('您不是该群聊成员');
  }
}

export async function getGroupDetail(user: User, groupId: string): Promise<GroupDetailDto> {
  const group = await findGroupOrThrow(groupId);
  await checkMembershipOrThrow(groupId, user.id);

  const membersResult = await query(
    `SELECT gm.id, gm.user_id, gm.is_ai, gm.joined_at,
            u.nickname, u.avatar_url, u.email
     FROM group_members gm
     LEFT JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = $1
     ORDER BY gm.joined_at ASC`,
    [groupId],
  );

  const members: GroupMemberDto[] = membersResult.rows.map((row: any) => {
    let nickname: string;
    if (row.is_ai) {
      nickname = 'A宝助手';
    } else if (row.nickname) {
      nickname = row.nickname;
    } else if (row.email) {
      nickname = row.email.split('@')[0];
    } else {
      nickname = '未知用户';
    }

    return {
      id: row.id,
      userId: row.user_id || null,
      nickname,
      avatarUrl: row.avatar_url || null,
      isAi: row.is_ai,
      joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : String(row.joined_at),
    };
  });

  return {
    id: group.id,
    name: group.name,
    inviteCode: group.invite_code,
    createdAt: group.created_at instanceof Date ? group.created_at.toISOString() : String(group.created_at),
    members,
  };
}

export async function getGroupInviteCode(user: User, groupId: string): Promise<string> {
  const group = await findGroupOrThrow(groupId);
  await checkMembershipOrThrow(groupId, user.id);
  return group.invite_code;
}

export async function leaveGroup(user: User, groupId: string): Promise<void> {
  const memberResult = await query(
    `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, user.id],
  );
  if (memberResult.rows.length === 0) {
    throw new ForbiddenError('您不是该群聊成员');
  }

  await query(
    `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, user.id],
  );
}
