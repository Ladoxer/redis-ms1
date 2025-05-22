import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { 
  MessageData, 
  CreateMessageDto, 
  MessagePriority, 
  MessageStatus, 
  QueueStats,
  ProcessedMessage 
} from './message.interface';

// Type guard functions for safe JSON parsing
function isMessageData(obj: unknown): obj is MessageData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as MessageData).id === 'string' &&
    typeof (obj as MessageData).content === 'string' &&
    typeof (obj as MessageData).timestamp === 'string' &&
    Object.values(MessagePriority).includes((obj as MessageData).priority) &&
    Object.values(MessageStatus).includes((obj as MessageData).status)
  );
}

function parseMessageSafely(jsonString: string): MessageData | null {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    if (isMessageData(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  
  // Redis key patterns for different priority queues
  private readonly queueKeys = {
    [MessagePriority.URGENT]: 'queue:urgent',
    [MessagePriority.HIGH]: 'queue:high',
    [MessagePriority.NORMAL]: 'queue:normal',
    [MessagePriority.LOW]: 'queue:low',
  };

  // Redis keys for tracking
  private readonly uniqueMessageIds = 'unique_message_ids';
  private readonly processingMessages = 'processing_messages';
  private readonly completedMessages = 'completed_messages';
  private readonly failedMessages = 'failed_messages';

  constructor(private readonly redisService: RedisService) {}

  async enqueueMessage(createMessageDto: CreateMessageDto): Promise<MessageData> {
    const { content, priority = MessagePriority.NORMAL } = createMessageDto;
    
    // Generate unique message ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if this message content already exists (duplicate detection)
    const contentHash = Buffer.from(content).toString('base64');
    const isDuplicate = await this.redisService.sismember(
      `content_hashes:${priority}`, 
      contentHash
    );

    if (isDuplicate) {
      throw new Error('Duplicate message detected');
    }

    // Create message object
    const message: MessageData = {
      id: messageId,
      content,
      priority,
      status: MessageStatus.PENDING,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    // Add to appropriate priority queue
    const queueKey = this.queueKeys[priority];
    await this.redisService.lpush(queueKey, JSON.stringify(message));

    // Track unique message ID
    await this.redisService.sadd(this.uniqueMessageIds, messageId);
    
    // Track content hash to prevent duplicates
    await this.redisService.sadd(`content_hashes:${priority}`, contentHash);

    this.logger.log(`Message enqueued: ${messageId} with priority: ${priority}`);
    return message;
  }

  async getNextMessage(): Promise<ProcessedMessage> {
    // Check queues in priority order
    const priorityOrder = [
      MessagePriority.URGENT,
      MessagePriority.HIGH,
      MessagePriority.NORMAL,
      MessagePriority.LOW
    ];

    for (const priority of priorityOrder) {
      const queueKey = this.queueKeys[priority];
      const messageJson = await this.redisService.rpop(queueKey);
      
      if (messageJson) {
        const message = parseMessageSafely(messageJson);
        
        if (message) {
          // Update message status to processing
          message.status = MessageStatus.PROCESSING;
          message.processingStartTime = new Date().toISOString();
          
          // Add to processing set
          await this.redisService.sadd(
            this.processingMessages, 
            JSON.stringify(message)
          );

          const queueStats = await this.getQueueStats();
          
          this.logger.log(`Processing message: ${message.id}`);
          return { message, queueStats };
        } else {
          this.logger.error(`Failed to parse message: ${messageJson}`);
          continue;
        }
      }
    }

    // No messages found
    const queueStats = await this.getQueueStats();
    return { message: null, queueStats };
  }

  async completeMessage(messageId: string, success: boolean = true): Promise<void> {
    // Find message in processing set
    const processingMessages = await this.redisService.smembers(this.processingMessages);
    
    for (const msgJson of processingMessages) {
      const message = parseMessageSafely(msgJson);
      
      if (message && message.id === messageId) {
        // Remove from processing
        await this.redisService.srem(this.processingMessages, msgJson);
        
        // Update message status
        message.status = success ? MessageStatus.COMPLETED : MessageStatus.FAILED;
        message.completedTime = new Date().toISOString();
        
        // Add to appropriate completion set
        const targetSet = success ? this.completedMessages : this.failedMessages;
        await this.redisService.sadd(targetSet, JSON.stringify(message));
        
        this.logger.log(`Message ${messageId} marked as ${message.status}`);
        return;
      }
    }
    
    throw new Error(`Message ${messageId} not found in processing queue`);
  }

  async retryFailedMessage(messageId: string): Promise<void> {
    const failedMessages = await this.redisService.smembers(this.failedMessages);
    
    for (const msgJson of failedMessages) {
      const message = parseMessageSafely(msgJson);
      
      if (message && message.id === messageId && (message.retryCount || 0) < 3) {
        // Remove from failed set
        await this.redisService.srem(this.failedMessages, msgJson);
        
        // Update retry count and reset status
        message.retryCount = (message.retryCount || 0) + 1;
        message.status = MessageStatus.PENDING;
        message.processingStartTime = undefined;
        message.completedTime = undefined;
        
        // Re-enqueue with original priority
        const queueKey = this.queueKeys[message.priority];
        await this.redisService.lpush(queueKey, JSON.stringify(message));
        
        this.logger.log(`Message ${messageId} retried (attempt ${message.retryCount})`);
        return;
      }
    }
    
    throw new Error(`Message ${messageId} not found in failed queue or max retries exceeded`);
  }

  async getAllMessages(): Promise<MessageData[]> {
    const allMessages: MessageData[] = [];
    
    // Get messages from all priority queues
    for (const priority of Object.values(MessagePriority)) {
      const messages = await this.redisService.lrange(this.queueKeys[priority]);
      const parsedMessages = messages
        .map(msg => parseMessageSafely(msg))
        .filter((msg): msg is MessageData => msg !== null);
      
      allMessages.push(...parsedMessages);
    }
    
    return allMessages;
  }

  async getMessagesByPriority(priority: MessagePriority): Promise<MessageData[]> {
    const messages = await this.redisService.lrange(this.queueKeys[priority]);
    return messages
      .map(msg => parseMessageSafely(msg))
      .filter((msg): msg is MessageData => msg !== null);
  }

  async getQueueStats(): Promise<QueueStats> {
    const stats: QueueStats = {
      totalMessages: 0,
      pendingMessages: 0,
      processingMessages: 0,
      completedMessages: 0,
      failedMessages: 0,
      priorityBreakdown: {
        [MessagePriority.URGENT]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      uniqueMessageIds: 0,
    };

    // Count messages in each priority queue
    for (const priority of Object.values(MessagePriority)) {
      const count = await this.redisService.llen(this.queueKeys[priority]);
      stats.priorityBreakdown[priority] = count;
      stats.pendingMessages += count;
    }

    // Count processing, completed, and failed messages
    stats.processingMessages = await this.redisService.scard(this.processingMessages);
    stats.completedMessages = await this.redisService.scard(this.completedMessages);
    stats.failedMessages = await this.redisService.scard(this.failedMessages);

    // Count unique message IDs
    stats.uniqueMessageIds = await this.redisService.scard(this.uniqueMessageIds);

    // Calculate total
    stats.totalMessages = stats.pendingMessages + stats.processingMessages + 
                         stats.completedMessages + stats.failedMessages;

    return stats;
  }

  async clearCompletedMessages(): Promise<number> {
    const count = await this.redisService.scard(this.completedMessages);
    await this.redisService.del(this.completedMessages);
    this.logger.log(`Cleared ${count} completed messages`);
    return count;
  }

  async purgeAllQueues(): Promise<void> {
    // Clear all priority queues
    for (const queueKey of Object.values(this.queueKeys)) {
      await this.redisService.del(queueKey);
    }
    
    // Clear tracking sets
    await this.redisService.del(this.uniqueMessageIds);
    await this.redisService.del(this.processingMessages);
    await this.redisService.del(this.completedMessages);
    await this.redisService.del(this.failedMessages);
    
    // Clear content hashes
    for (const priority of Object.values(MessagePriority)) {
      await this.redisService.del(`content_hashes:${priority}`);
    }
    
    this.logger.log('All queues purged');
  }
}