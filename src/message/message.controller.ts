import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  Param, 
  Query, 
  Delete,
  Put,
  HttpException,
  HttpStatus 
} from '@nestjs/common';
import { MessageService } from './message.service';
import { 
  CreateMessageDto, 
  MessageData, 
  MessagePriority, 
  QueueStats,
  ProcessedMessage 
} from './message.interface';

// Utility function for safe error message extraction
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  async createMessage(@Body() createMessageDto: CreateMessageDto) {
    try {
      const message = await this.messageService.enqueueMessage(createMessageDto);
      return {
        success: true,
        message: 'Message added to queue',
        data: message,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('user/:userId')
  async createMessageForUser(
    @Param('userId') userId: string,
    @Body() createMessageDto: Omit<CreateMessageDto, 'userId'>
  ) {
    try {
      const message = await this.messageService.enqueueMessage({
        ...createMessageDto,
        userId,
      });
      return {
        success: true,
        message: 'Message added to queue for user',
        data: message,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get()
  async getAllMessages(): Promise<{
    success: boolean;
    count: number;
    messages: MessageData[];
  }> {
    const messages = await this.messageService.getAllMessages();
    return {
      success: true,
      count: messages.length,
      messages,
    };
  }

  @Get('priority/:priority')
  async getMessagesByPriority(
    @Param('priority') priority: MessagePriority
  ): Promise<{
    success: boolean;
    priority: MessagePriority;
    count: number;
    messages: MessageData[];
  }> {
    // Validate priority
    if (!Object.values(MessagePriority).includes(priority)) {
      throw new HttpException('Invalid priority', HttpStatus.BAD_REQUEST);
    }

    const messages = await this.messageService.getMessagesByPriority(priority);
    return {
      success: true,
      priority,
      count: messages.length,
      messages,
    };
  }

  @Get('next')
  async processNextMessage(): Promise<{
    success: boolean;
    data: ProcessedMessage;
  }> {
    const result = await this.messageService.getNextMessage();
    return {
      success: true,
      data: result,
    };
  }

  @Put(':messageId/complete')
  async completeMessage(
    @Param('messageId') messageId: string,
    @Query('success') success?: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const isSuccess = success !== 'false'; // Default to true unless explicitly false
      await this.messageService.completeMessage(messageId, isSuccess);
      
      return {
        success: true,
        message: `Message ${messageId} marked as ${isSuccess ? 'completed' : 'failed'}`,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.NOT_FOUND);
    }
  }

  @Put(':messageId/retry')
  async retryMessage(
    @Param('messageId') messageId: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.messageService.retryFailedMessage(messageId);
      return {
        success: true,
        message: `Message ${messageId} retried successfully`,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('stats')
  async getQueueStats(): Promise<{
    success: boolean;
    stats: QueueStats;
  }> {
    const stats = await this.messageService.getQueueStats();
    return {
      success: true,
      stats,
    };
  }

  @Delete('completed')
  async clearCompletedMessages(): Promise<{
    success: boolean;
    message: string;
    clearedCount: number;
  }> {
    const clearedCount = await this.messageService.clearCompletedMessages();
    return {
      success: true,
      message: 'Completed messages cleared',
      clearedCount,
    };
  }

  @Delete('all')
  async purgeAllQueues(): Promise<{
    success: boolean;
    message: string;
  }> {
    await this.messageService.purgeAllQueues();
    return {
      success: true,
      message: 'All queues purged successfully',
    };
  }
}