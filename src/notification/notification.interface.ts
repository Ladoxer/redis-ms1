// notification.interface.ts

export enum NotificationType {
  MESSAGE_CREATED = 'message_created',
  MESSAGE_PROCESSING = 'message_processing',
  MESSAGE_COMPLETED = 'message_completed',
  MESSAGE_FAILED = 'message_failed',
  MESSAGE_RETRIED = 'message_retried',
  USER_JOINED = 'user_joined',
  USER_LEFT = 'user_left',
  SYSTEM_ALERT = 'system_alert',
  CHAT_MESSAGE = 'chat_message',
}

export interface BaseNotification {
  id: string;
  type: NotificationType;
  timestamp: string;
  userId?: string;
  username?: string;
}

export interface MessageNotification extends BaseNotification {
  type: NotificationType.MESSAGE_CREATED | NotificationType.MESSAGE_PROCESSING | 
        NotificationType.MESSAGE_COMPLETED | NotificationType.MESSAGE_FAILED | 
        NotificationType.MESSAGE_RETRIED;
  messageId: string;
  messageContent: string;
  priority: string;
  processingTime?: number;
  error?: string;
}

export interface UserNotification extends BaseNotification {
  type: NotificationType.USER_JOINED | NotificationType.USER_LEFT;
  userRole?: string;
}

export interface SystemNotification extends BaseNotification {
  type: NotificationType.SYSTEM_ALERT;
  alertLevel: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: Record<string, any>;
}

export interface ChatMessage extends BaseNotification {
  type: NotificationType.CHAT_MESSAGE;
  channelId: string;
  channelName: string;
  message: string;
  mentions?: string[];
  replyTo?: string;
}

export type Notification = MessageNotification | UserNotification | SystemNotification | ChatMessage;

// Chat-specific interfaces
export interface ChatChannel {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  lastActivity: string;
}

export interface ChatMember {
  userId: string;
  username: string;
  joinedAt: string;
  role: 'admin' | 'moderator' | 'member';
  isOnline: boolean;
  lastSeen: string;
}

export interface CreateChannelDto {
  name: string;
  description?: string;
  isPrivate?: boolean;
  initialMembers?: string[];
}

export interface SendMessageDto {
  message: string;
  mentions?: string[];
  replyTo?: string;
}

export interface ChannelInfo {
  channel: ChatChannel;
  members: ChatMember[];
  recentMessages: ChatMessage[];
  unreadCount: number;
}

// Real-time subscription interfaces
export interface SubscriptionChannels {
  userNotifications: string;      // user:{userId}:notifications
  messageUpdates: string;         // message:updates
  systemAlerts: string;          // system:alerts
  chatChannel: string;           // chat:{channelId}
  userActivity: string;          // user:{userId}:activity
}

export interface RealtimeEvent {
  channel: string;
  event: string;
  data: any;
  timestamp: string;
}

// WebSocket message types (for future WebSocket implementation)
export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'notification' | 'chat' | 'presence';
  payload: any;
}

export interface PresenceInfo {
  userId: string;
  username: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: string;
  currentChannel?: string;
}