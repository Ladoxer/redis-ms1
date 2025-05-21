export interface MessageData {
  content: string;
  timestamp: string;
  id: string;
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