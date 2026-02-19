import { WebSocket } from 'ws';
import type { WsServerMessage } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class WsSessionManager {
  private userSessions: Map<string, WebSocket> = new Map();
  private groupMembers: Map<string, Set<string>> = new Map();
  private userGroups: Map<string, Set<string>> = new Map();

  addSession(userId: string, ws: WebSocket): void {
    this.userSessions.set(userId, ws);
    logger.debug({ userId }, 'WebSocket session added');
  }

  removeSession(userId: string): void {
    this.userSessions.delete(userId);
    logger.debug({ userId }, 'WebSocket session removed');
  }

  joinGroup(userId: string, groupId: string): void {
    if (!this.groupMembers.has(groupId)) {
      this.groupMembers.set(groupId, new Set());
    }
    this.groupMembers.get(groupId)!.add(userId);

    if (!this.userGroups.has(userId)) {
      this.userGroups.set(userId, new Set());
    }
    this.userGroups.get(userId)!.add(groupId);
  }

  leaveGroup(userId: string, groupId: string): void {
    this.groupMembers.get(groupId)?.delete(userId);
    this.userGroups.get(userId)?.delete(groupId);
  }

  leaveAllGroups(userId: string): void {
    const groups = this.userGroups.get(userId);
    if (groups) {
      for (const groupId of groups) {
        this.groupMembers.get(groupId)?.delete(userId);
      }
      this.userGroups.delete(userId);
    }
  }

  getGroupMembers(groupId: string): Set<string> {
    return this.groupMembers.get(groupId) ?? new Set();
  }

  getUserSession(userId: string): WebSocket | undefined {
    return this.userSessions.get(userId);
  }

  broadcastToGroup(groupId: string, message: WsServerMessage, excludeUserId?: string): void {
    const members = this.groupMembers.get(groupId);
    if (!members) return;

    const data = JSON.stringify(message);
    for (const userId of members) {
      if (userId === excludeUserId) continue;
      const ws = this.userSessions.get(userId);
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  isOnline(userId: string): boolean {
    return this.userSessions.has(userId);
  }
}

export const sessionManager = new WsSessionManager();
