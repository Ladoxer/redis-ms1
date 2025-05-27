import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import {
  CreateChannelDto,
  SendMessageDto,
  ChatChannel,
  ChatMessage,
  ChannelInfo,
  PresenceInfo,
} from '../notification/notification.interface';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // === CHANNEL MANAGEMENT ===

  @Post('channels')
  async createChannel(
    @Body() createChannelDto: CreateChannelDto,
    @Query('creatorId') creatorId: string
  ): Promise<{
    success: boolean;
    message: string;
    data: ChatChannel;
  }> {
    try {
      const channel = await this.chatService.createChannel(creatorId, createChannelDto);
      return {
        success: true,
        message: 'Channel created successfully',
        data: channel,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('channels')
  async getAllChannels(
    @Query('includePrivate') includePrivate?: string
  ): Promise<{
    success: boolean;
    data: ChatChannel[];
  }> {
    const channels = await this.chatService.getAllChannels(includePrivate === 'true');
    return {
      success: true,
      data: channels,
    };
  }

  @Get('channels/:channelId')
  async getChannel(
    @Param('channelId') channelId: string
  ): Promise<{
    success: boolean;
    data: ChatChannel;
  }> {
    const channel = await this.chatService.getChannel(channelId);
    if (!channel) {
      throw new HttpException('Channel not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data: channel,
    };
  }

  @Get('users/:userId/channels')
  async getUserChannels(
    @Param('userId') userId: string
  ): Promise<{
    success: boolean;
    data: ChatChannel[];
  }> {
    const channels = await this.chatService.getUserChannels(userId);
    return {
      success: true,
      data: channels,
    };
  }

  @Get('channels/:channelId/info')
  async getChannelInfo(
    @Param('channelId') channelId: string,
    @Query('userId') userId: string
  ): Promise<{
    success: boolean;
    data: ChannelInfo;
  }> {
    try {
      const info = await this.chatService.getChannelInfo(channelId, userId);
      return {
        success: true,
        data: info,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.FORBIDDEN);
    }
  }

  // === MEMBER MANAGEMENT ===

  @Post('channels/:channelId/members')
  async addMemberToChannel(
    @Param('channelId') channelId: string,
    @Body() body: { userId: string; role?: 'admin' | 'moderator' | 'member' }
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.chatService.addMemberToChannel(channelId, body.userId, body.role);
      return {
        success: true,
        message: 'Member added successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete('channels/:channelId/members/:userId')
  async removeMemberFromChannel(
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
    @Query('removedBy') removedBy?: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.chatService.removeMemberFromChannel(channelId, userId, removedBy);
      return {
        success: true,
        message: 'Member removed successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('channels/:channelId/members')
  async getChannelMembers(
    @Param('channelId') channelId: string
  ): Promise<{
    success: boolean;
    data: any[];
  }> {
    const members = await this.chatService.getChannelMembers(channelId);
    return {
      success: true,
      data: members,
    };
  }

  // === MESSAGING ===

  @Post('channels/:channelId/messages')
  async sendMessage(
    @Param('channelId') channelId: string,
    @Query('senderId') senderId: string,
    @Body() messageDto: SendMessageDto
  ): Promise<{
    success: boolean;
    message: string;
    data: ChatMessage;
  }> {
    try {
      const chatMessage = await this.chatService.sendMessage(channelId, senderId, messageDto);
      return {
        success: true,
        message: 'Message sent successfully',
        data: chatMessage,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.FORBIDDEN);
    }
  }

  @Get('channels/:channelId/messages')
  async getChannelMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string
  ): Promise<{
    success: boolean;
    data: ChatMessage[];
  }> {
    const messages = await this.chatService.getChannelMessages(
      channelId,
      limit ? parseInt(limit) : 50,
      before
    );
    return {
      success: true,
      data: messages,
    };
  }

  // === PRESENCE SYSTEM ===

  @Post('presence/:userId')
  async setUserPresence(
    @Param('userId') userId: string,
    @Body() body: {
      status: 'online' | 'away' | 'busy' | 'offline';
      currentChannel?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.chatService.setUserPresence(userId, body.status, body.currentChannel);
      return {
        success: true,
        message: 'Presence updated successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('presence/:userId')
  async getUserPresence(
    @Param('userId') userId: string
  ): Promise<{
    success: boolean;
    data: PresenceInfo | null;
  }> {
    const presence = await this.chatService.getUserPresence(userId);
    return {
      success: true,
      data: presence,
    };
  }

  @Get('presence')
  async getOnlineUsers(): Promise<{
    success: boolean;
    data: PresenceInfo[];
  }> {
    const onlineUsers = await this.chatService.getOnlineUsers();
    return {
      success: true,
      data: onlineUsers,
    };
  }

  // === STATISTICS ===

  @Get('stats')
  async getChatStats(): Promise<{
    success: boolean;
    data: {
      totalChannels: number;
      totalMessages: number;
      activeSubscriptions: number;
      onlineUsers: number;
    };
  }> {
    const stats = await this.chatService.getChatStats();
    return {
      success: true,
      data: stats,
    };
  }

  // === ADMIN OPERATIONS ===

  @Post('cleanup/presence')
  async cleanupInactivePresence(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.chatService.cleanupInactivePresence();
      return {
        success: true,
        message: 'Inactive presence data cleaned up successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}