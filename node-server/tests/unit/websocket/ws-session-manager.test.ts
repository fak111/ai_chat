import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsSessionManager } from '../../../src/websocket/ws-session-manager.js';
import type { WsServerMessage } from '../../../src/types/index.js';

// Minimal mock WebSocket
function createMockWs(): any {
  return {
    send: vi.fn(),
    readyState: 1, // WebSocket.OPEN
    OPEN: 1,
  };
}

const userId1 = '11111111-1111-1111-1111-111111111111';
const userId2 = '22222222-2222-2222-2222-222222222222';
const userId3 = '33333333-3333-3333-3333-333333333333';
const groupId1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const groupId2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('WsSessionManager', () => {
  let manager: WsSessionManager;

  beforeEach(() => {
    manager = new WsSessionManager();
  });

  describe('addSession / removeSession', () => {
    it('should add a user session', () => {
      const ws = createMockWs();
      manager.addSession(userId1, ws);
      expect(manager.getUserSession(userId1)).toBe(ws);
      expect(manager.isOnline(userId1)).toBe(true);
    });

    it('should replace existing session for same user', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.addSession(userId1, ws1);
      manager.addSession(userId1, ws2);
      expect(manager.getUserSession(userId1)).toBe(ws2);
    });

    it('should remove a user session', () => {
      const ws = createMockWs();
      manager.addSession(userId1, ws);
      manager.removeSession(userId1);
      expect(manager.getUserSession(userId1)).toBeUndefined();
      expect(manager.isOnline(userId1)).toBe(false);
    });

    it('should not throw when removing non-existent session', () => {
      expect(() => manager.removeSession(userId1)).not.toThrow();
    });
  });

  describe('joinGroup / leaveGroup', () => {
    it('should add user to a group', () => {
      manager.joinGroup(userId1, groupId1);
      const members = manager.getGroupMembers(groupId1);
      expect(members.has(userId1)).toBe(true);
    });

    it('should track multiple users in a group', () => {
      manager.joinGroup(userId1, groupId1);
      manager.joinGroup(userId2, groupId1);
      const members = manager.getGroupMembers(groupId1);
      expect(members.size).toBe(2);
      expect(members.has(userId1)).toBe(true);
      expect(members.has(userId2)).toBe(true);
    });

    it('should track user in multiple groups', () => {
      manager.joinGroup(userId1, groupId1);
      manager.joinGroup(userId1, groupId2);
      // User should be in both groups
      expect(manager.getGroupMembers(groupId1).has(userId1)).toBe(true);
      expect(manager.getGroupMembers(groupId2).has(userId1)).toBe(true);
    });

    it('should remove user from a group', () => {
      manager.joinGroup(userId1, groupId1);
      manager.joinGroup(userId2, groupId1);
      manager.leaveGroup(userId1, groupId1);
      const members = manager.getGroupMembers(groupId1);
      expect(members.has(userId1)).toBe(false);
      expect(members.has(userId2)).toBe(true);
    });

    it('should not throw when leaving a group not joined', () => {
      expect(() => manager.leaveGroup(userId1, groupId1)).not.toThrow();
    });

    it('should return empty set for unknown group', () => {
      const members = manager.getGroupMembers(groupId1);
      expect(members.size).toBe(0);
    });
  });

  describe('leaveAllGroups', () => {
    it('should remove user from all groups', () => {
      manager.joinGroup(userId1, groupId1);
      manager.joinGroup(userId1, groupId2);
      manager.leaveAllGroups(userId1);
      expect(manager.getGroupMembers(groupId1).has(userId1)).toBe(false);
      expect(manager.getGroupMembers(groupId2).has(userId1)).toBe(false);
    });

    it('should not affect other users', () => {
      manager.joinGroup(userId1, groupId1);
      manager.joinGroup(userId2, groupId1);
      manager.leaveAllGroups(userId1);
      expect(manager.getGroupMembers(groupId1).has(userId2)).toBe(true);
    });

    it('should not throw when user has no groups', () => {
      expect(() => manager.leaveAllGroups(userId1)).not.toThrow();
    });
  });

  describe('broadcastToGroup', () => {
    it('should send message to all group members with active sessions', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.addSession(userId1, ws1);
      manager.addSession(userId2, ws2);
      manager.joinGroup(userId1, groupId1);
      manager.joinGroup(userId2, groupId1);

      const message: WsServerMessage = { type: 'PONG' };
      manager.broadcastToGroup(groupId1, message);

      expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should exclude specified user from broadcast', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.addSession(userId1, ws1);
      manager.addSession(userId2, ws2);
      manager.joinGroup(userId1, groupId1);
      manager.joinGroup(userId2, groupId1);

      const message: WsServerMessage = { type: 'PONG' };
      manager.broadcastToGroup(groupId1, message, userId1);

      expect(ws1.send).not.toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should skip users without active sessions', () => {
      manager.joinGroup(userId1, groupId1); // no session added
      const ws2 = createMockWs();
      manager.addSession(userId2, ws2);
      manager.joinGroup(userId2, groupId1);

      const message: WsServerMessage = { type: 'PONG' };
      manager.broadcastToGroup(groupId1, message);

      // Only ws2 should receive the message
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should skip connections that are not OPEN', () => {
      const ws1 = createMockWs();
      ws1.readyState = 3; // CLOSED
      manager.addSession(userId1, ws1);
      manager.joinGroup(userId1, groupId1);

      const message: WsServerMessage = { type: 'PONG' };
      manager.broadcastToGroup(groupId1, message);

      expect(ws1.send).not.toHaveBeenCalled();
    });

    it('should not throw for empty group', () => {
      const message: WsServerMessage = { type: 'PONG' };
      expect(() => manager.broadcastToGroup(groupId1, message)).not.toThrow();
    });
  });

  describe('isOnline', () => {
    it('should return false for unknown user', () => {
      expect(manager.isOnline(userId1)).toBe(false);
    });

    it('should return true after addSession', () => {
      manager.addSession(userId1, createMockWs());
      expect(manager.isOnline(userId1)).toBe(true);
    });

    it('should return false after removeSession', () => {
      manager.addSession(userId1, createMockWs());
      manager.removeSession(userId1);
      expect(manager.isOnline(userId1)).toBe(false);
    });
  });
});
