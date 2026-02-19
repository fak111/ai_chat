// User types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  nickname: string | null;
  avatar_url: string | null;
  email_verified: boolean;
  verification_token: string | null;
  verification_token_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserDto {
  id: string;
  email: string;
  nickname: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

// Group types
export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_at: Date;
  updated_at: Date;
}

export interface GroupDto {
  id: string;
  name: string;
  inviteCode: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface GroupDetailDto {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  members: GroupMemberDto[];
}

export interface GroupMemberDto {
  id: string;
  userId: string | null;
  nickname: string;
  avatarUrl: string | null;
  isAi: boolean;
  joinedAt: string;
}

// Group member DB row
export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string | null;
  is_ai: boolean;
  joined_at: Date;
}

// Message types
export interface Message {
  id: string;
  group_id: string;
  sender_id: string | null;
  content: string;
  message_type: 'USER' | 'AI' | 'SYSTEM';
  reply_to_id: string | null;
  created_at: Date;
}

export interface MessageDto {
  id: string;
  groupId: string;
  senderId: string | null;
  senderNickname: string | null;
  content: string;
  messageType: string;
  replyToId: string | null;
  replyToContent: string | null;
  createdAt: string;
}

export interface PagedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
}

// Auth types
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// WebSocket message types
export type WsClientMessage =
  | { type: 'SEND_MESSAGE'; groupId: string; content: string; replyToId?: string }
  | { type: 'JOIN_GROUP'; groupId: string }
  | { type: 'LEAVE_GROUP'; groupId: string }
  | { type: 'PING' };

export type WsServerMessage =
  | { type: 'NEW_MESSAGE'; message: MessageDto }
  | { type: 'JOINED_GROUP'; groupId: string }
  | { type: 'LEFT_GROUP'; groupId: string }
  | { type: 'PONG' }
  | { type: 'ERROR'; message: string };

// Express request extension
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
