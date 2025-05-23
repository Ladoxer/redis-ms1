export interface MessageData {
  id: string;
  content: string;
  timestamp: string;
  priority: MessagePriority;
  status: MessageStatus;
  userId?: string;
  username?: string;
  retryCount?: number;
  processingStartTime?: string;
  completedTime?: string;
  error?: string;
}

export interface MessageResponse {
  message: MessageData | string;
}

export interface MessagesResponse {
  count: number;
  messages: MessageData[];
}

export interface CreateMessageResponse {
  success: boolean;
  message: string;
  queueLength: number;
}

export enum MessagePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum MessageStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface CreateMessageDto {
  content: string;
  priority?: MessagePriority;
  userId?: string;
}

export interface QueueStats {
  totalMessages: number;
  pendingMessages: number;
  processingMessages: number;
  completedMessages: number;
  failedMessages: number;
  priorityBreakdown: {
    [key in MessagePriority]: number;
  };
  uniqueMessageIds: number;
}

export interface ProcessedMessage {
  message: MessageData | null;
  queueStats: QueueStats;
}