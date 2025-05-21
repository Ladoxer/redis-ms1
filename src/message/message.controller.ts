import { Controller, Post, Body, Get } from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageResponse, MessageResponse, MessagesResponse } from './message.interface';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  async createMessage(@Body('content') content: string): Promise<CreateMessageResponse> {
    const position = await this.messageService.enqueueMessage(content);
    return {
      success: true,
      message: 'Message added to queue',
      queueLength: position,
    };
  }

  @Get()
  async getMessages(): Promise<MessagesResponse> {
    const messages = await this.messageService.getAllMessages();
    return {
      count: messages.length,
      messages,
    };
  }
  
  @Get('next')
  async processNextMessage(): Promise<MessageResponse> {
    const message = await this.messageService.getNextMessage();
    
    if (message === null) {
      return {
        message: 'No messages in queue',
      };
    }
    
    return {
      message,
    };
  }
}