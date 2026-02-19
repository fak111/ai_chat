import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryResult } from 'pg';

// Mock db client before importing service
vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
  getClient: vi.fn(),
}));

import { query, getClient } from '../../../src/db/client.js';
import {
  createGroup,
  joinGroup,
  getUserGroups,
  getGroupDetail,
  getGroupInviteCode,
  leaveGroup,
} from '../../../src/services/group.service.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../../../src/utils/errors.js';
import type { User } from '../../../src/types/index.js';

const mockQuery = vi.mocked(query);
const mockGetClient = vi.mocked(getClient);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    password_hash: 'hash',
    nickname: 'Tester',
    avatar_url: null,
    email_verified: true,
    verification_token: null,
    verification_token_expires_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function mockQueryResult<T>(rows: T[]): QueryResult<any> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

// Mock PoolClient for transaction tests
function makeMockClient() {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return client;
}

describe('GroupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== createGroup ==========
  describe('createGroup', () => {
    it('should create group with creator and AI member', async () => {
      const user = makeUser();
      const mockClient = makeMockClient();
      mockGetClient.mockResolvedValue(mockClient as any);

      // BEGIN
      mockClient.query.mockResolvedValueOnce(mockQueryResult([]));
      // INSERT group - succeed on first try
      mockClient.query.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1',
          name: '测试群',
          invite_code: 'ABC123',
          created_at: new Date('2025-01-01'),
          updated_at: new Date('2025-01-01'),
        }]),
      );
      // INSERT creator member
      mockClient.query.mockResolvedValueOnce(mockQueryResult([]));
      // INSERT AI member
      mockClient.query.mockResolvedValueOnce(mockQueryResult([]));
      // COMMIT
      mockClient.query.mockResolvedValueOnce(mockQueryResult([]));

      const result = await createGroup(user, '测试群');

      expect(result.id).toBe('group-1');
      expect(result.name).toBe('测试群');
      expect(result.inviteCode).toBe('ABC123');
      expect(result.memberCount).toBe(2);
      expect(result.lastMessage).toBeNull();
      expect(result.lastMessageAt).toBeNull();
      expect(result.unreadCount).toBe(0);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw BadRequestError for empty name', async () => {
      const user = makeUser();
      await expect(createGroup(user, '')).rejects.toThrow(BadRequestError);
      await expect(createGroup(user, '  ')).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError for name exceeding 50 chars', async () => {
      const user = makeUser();
      await expect(createGroup(user, 'a'.repeat(51))).rejects.toThrow(BadRequestError);
    });

    it('should retry on invite code conflict', async () => {
      const user = makeUser();
      const mockClient = makeMockClient();
      mockGetClient.mockResolvedValue(mockClient as any);

      // BEGIN
      mockClient.query.mockResolvedValueOnce(mockQueryResult([]));
      // First INSERT - conflict (unique_violation code 23505)
      mockClient.query.mockRejectedValueOnce({ code: '23505' });
      // Retry INSERT - success
      mockClient.query.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1',
          name: '测试群',
          invite_code: 'XYZ789',
          created_at: new Date('2025-01-01'),
          updated_at: new Date('2025-01-01'),
        }]),
      );
      // INSERT creator member
      mockClient.query.mockResolvedValueOnce(mockQueryResult([]));
      // INSERT AI member
      mockClient.query.mockResolvedValueOnce(mockQueryResult([]));
      // COMMIT
      mockClient.query.mockResolvedValueOnce(mockQueryResult([]));

      const result = await createGroup(user, '测试群');
      expect(result.inviteCode).toBe('XYZ789');
    });

    it('should rollback on error', async () => {
      const user = makeUser();
      const mockClient = makeMockClient();
      mockGetClient.mockResolvedValue(mockClient as any);

      mockClient.query.mockResolvedValueOnce(mockQueryResult([])); // BEGIN
      mockClient.query.mockRejectedValueOnce(new Error('DB error')); // INSERT fails with non-conflict error

      await expect(createGroup(user, '测试群')).rejects.toThrow('DB error');
      // Should have called ROLLBACK
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ========== joinGroup ==========
  describe('joinGroup', () => {
    it('should join group by invite code', async () => {
      const user = makeUser();

      // Find group by invite code
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1',
          name: '测试群',
          invite_code: 'ABC123',
          created_at: new Date('2025-01-01'),
          updated_at: new Date('2025-01-01'),
        }]),
      );
      // Check if already member - not a member
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));
      // INSERT member
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));
      // Get member count
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ count: '3' }]));
      // Get last message
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await joinGroup(user, 'abc123'); // lowercase input
      expect(result.id).toBe('group-1');
      expect(result.name).toBe('测试群');
      expect(result.memberCount).toBe(3);
    });

    it('should throw NotFoundError for invalid invite code', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(joinGroup(user, 'INVALID')).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError if already a member', async () => {
      const user = makeUser();

      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1', name: '测试群', invite_code: 'ABC123',
          created_at: new Date(), updated_at: new Date(),
        }]),
      );
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: 'member-1' }]));

      await expect(joinGroup(user, 'ABC123')).rejects.toThrow(ConflictError);
    });

    it('should convert invite code to uppercase', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(joinGroup(user, 'abc123')).rejects.toThrow(NotFoundError);
      // Verify the query was called with uppercase
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('invite_code'),
        ['ABC123'],
      );
    });
  });

  // ========== getUserGroups ==========
  describe('getUserGroups', () => {
    it('should return empty array when user has no groups', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      const result = await getUserGroups(user);
      expect(result).toEqual([]);
    });

    it('should return groups with member count and last message', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([
          {
            id: 'group-1',
            name: '测试群',
            invite_code: 'ABC123',
            created_at: new Date('2025-01-01'),
            updated_at: new Date('2025-01-02'),
            member_count: '3',
            last_message_content: '你好世界',
            last_message_sender_nickname: 'Alice',
            last_message_sender_email: null,
            last_message_type: 'USER',
            last_message_at: new Date('2025-01-02T10:00:00Z'),
          },
        ]),
      );

      const result = await getUserGroups(user);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('group-1');
      expect(result[0].memberCount).toBe(3);
      expect(result[0].lastMessage).toBe('Alice: 你好世界');
      expect(result[0].lastMessageAt).toBeTruthy();
      expect(result[0].unreadCount).toBe(0);
    });

    it('should show AI as sender name for AI messages', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([
          {
            id: 'group-1',
            name: '测试群',
            invite_code: 'ABC123',
            created_at: new Date('2025-01-01'),
            updated_at: new Date('2025-01-02'),
            member_count: '2',
            last_message_content: '我是AI助手',
            last_message_sender_nickname: null,
            last_message_sender_email: null,
            last_message_type: 'AI',
            last_message_at: new Date('2025-01-02T10:00:00Z'),
          },
        ]),
      );

      const result = await getUserGroups(user);
      expect(result[0].lastMessage).toBe('AI: 我是AI助手');
    });

    it('should truncate last message to 50 chars', async () => {
      const user = makeUser();
      const longContent = '这是一条非常长的消息内容'.repeat(10);
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([
          {
            id: 'group-1',
            name: '测试群',
            invite_code: 'ABC123',
            created_at: new Date('2025-01-01'),
            updated_at: new Date('2025-01-02'),
            member_count: '2',
            last_message_content: longContent,
            last_message_sender_nickname: 'Bob',
            last_message_sender_email: null,
            last_message_type: 'USER',
            last_message_at: new Date('2025-01-02T10:00:00Z'),
          },
        ]),
      );

      const result = await getUserGroups(user);
      expect(result[0].lastMessage!.length).toBeLessThanOrEqual(50);
    });

    it('should use email prefix as fallback for nickname', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([
          {
            id: 'group-1',
            name: '测试群',
            invite_code: 'ABC123',
            created_at: new Date('2025-01-01'),
            updated_at: new Date('2025-01-02'),
            member_count: '2',
            last_message_content: 'Hello',
            last_message_sender_nickname: null,
            last_message_sender_email: 'alice@example.com',
            last_message_type: 'USER',
            last_message_at: new Date('2025-01-02T10:00:00Z'),
          },
        ]),
      );

      const result = await getUserGroups(user);
      expect(result[0].lastMessage).toBe('alice: Hello');
    });
  });

  // ========== getGroupDetail ==========
  describe('getGroupDetail', () => {
    it('should return group detail with members', async () => {
      const user = makeUser();

      // Find group
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1',
          name: '测试群',
          invite_code: 'ABC123',
          created_at: new Date('2025-01-01'),
          updated_at: new Date('2025-01-01'),
        }]),
      );
      // Check membership
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: 'member-1' }]));
      // Get members
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([
          {
            id: 'member-1',
            user_id: 'user-1',
            nickname: 'Tester',
            avatar_url: null,
            is_ai: false,
            joined_at: new Date('2025-01-01'),
            email: 'test@example.com',
          },
          {
            id: 'member-2',
            user_id: null,
            nickname: null,
            avatar_url: null,
            is_ai: true,
            joined_at: new Date('2025-01-01'),
            email: null,
          },
        ]),
      );

      const result = await getGroupDetail(user, 'group-1');
      expect(result.id).toBe('group-1');
      expect(result.members).toHaveLength(2);
      // Regular member
      expect(result.members[0].userId).toBe('user-1');
      expect(result.members[0].nickname).toBe('Tester');
      expect(result.members[0].isAi).toBe(false);
      // AI member
      expect(result.members[1].userId).toBeNull();
      expect(result.members[1].nickname).toBe('A宝助手');
      expect(result.members[1].isAi).toBe(true);
    });

    it('should throw NotFoundError if group does not exist', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(getGroupDetail(user, 'nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user is not a member', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1', name: '测试群', invite_code: 'ABC123',
          created_at: new Date(), updated_at: new Date(),
        }]),
      );
      mockQuery.mockResolvedValueOnce(mockQueryResult([])); // not a member

      await expect(getGroupDetail(user, 'group-1')).rejects.toThrow(ForbiddenError);
    });

    it('should use email prefix as fallback nickname for members', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1', name: '测试群', invite_code: 'ABC123',
          created_at: new Date(), updated_at: new Date(),
        }]),
      );
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: 'member-1' }]));
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([
          {
            id: 'member-1',
            user_id: 'user-1',
            nickname: null,
            avatar_url: null,
            is_ai: false,
            joined_at: new Date(),
            email: 'bob@example.com',
          },
        ]),
      );

      const result = await getGroupDetail(user, 'group-1');
      expect(result.members[0].nickname).toBe('bob');
    });
  });

  // ========== getGroupInviteCode ==========
  describe('getGroupInviteCode', () => {
    it('should return invite code for group member', async () => {
      const user = makeUser();

      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1', name: '测试群', invite_code: 'ABC123',
          created_at: new Date(), updated_at: new Date(),
        }]),
      );
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: 'member-1' }]));

      const result = await getGroupInviteCode(user, 'group-1');
      expect(result).toBe('ABC123');
    });

    it('should throw NotFoundError if group does not exist', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(getGroupInviteCode(user, 'nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user is not a member', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(
        mockQueryResult([{
          id: 'group-1', name: '测试群', invite_code: 'ABC123',
          created_at: new Date(), updated_at: new Date(),
        }]),
      );
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(getGroupInviteCode(user, 'group-1')).rejects.toThrow(ForbiddenError);
    });
  });

  // ========== leaveGroup ==========
  describe('leaveGroup', () => {
    it('should leave group successfully', async () => {
      const user = makeUser();

      // Check membership
      mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: 'member-1' }]));
      // DELETE member
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(leaveGroup(user, 'group-1')).resolves.not.toThrow();
    });

    it('should throw ForbiddenError if not a member', async () => {
      const user = makeUser();
      mockQuery.mockResolvedValueOnce(mockQueryResult([]));

      await expect(leaveGroup(user, 'group-1')).rejects.toThrow(ForbiddenError);
    });
  });
});
