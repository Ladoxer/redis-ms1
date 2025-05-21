import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { MessageData } from './message.interface';

@Injectable()
export class MessageService {
  private readonly queueKey = 'message_queue';
  private readonly logger = new Logger(MessageService.name);

  constructor(private readonly redisService: RedisService) {}

  async enqueueMessage(message: string): Promise<number> {
    const messageObj = JSON.stringify({
      content: message,
      timestamp: new Date().toISOString(),
      id: Date.now().toString(),
    });

    return await this.redisService.lpush(this.queueKey, messageObj);
  }

  async getQueueLength(): Promise<number> {
    return await this.redisService.llen(this.queueKey);
  }

  async getAllMessages(): Promise<MessageData[]> {
    const messages = await this.redisService.lrange(this.queueKey);
    return messages.map((msg) => {
      try {
        return JSON.parse(msg) as MessageData;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
        this.logger.error(`Failed to parse message: ${errorMessage}`);
        
        return { 
          content: msg, 
          timestamp: new Date().toISOString(),
          id: 'parse-error',
          error: 'Failed to parse' 
        };
      }
    });
  }

  async getNextMessage(): Promise<MessageData | null> {
    const result = await this.redisService.rpop(this.queueKey);
    if (!result) return null;

    try {
      return JSON.parse(result) as MessageData;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      this.logger.error(`Failed to parse message: ${errorMessage}`);
      
      return { 
        content: result, 
        timestamp: new Date().toISOString(),
        id: 'parse-error',
        error: 'Failed to parse' 
      };
    }
  }
}
