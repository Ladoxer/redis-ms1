/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { NotificationService } from './notification.service';
import {
  Notification,
  SystemNotification,
  NotificationType,
} from './notification.interface';

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

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('user/:userId/history')
  async getUserNotificationHistory(
    @Param('userId') userId: string,
    @Query('limit') limit?: string
  ): Promise<{
    success: boolean;
    data: Notification[];
  }> {
    const notifications = await this.notificationService.getUserNotificationHistory(
      userId,
      limit ? parseInt(limit) : 50
    );

    return {
      success: true,
      data: notifications,
    };
  }

  @Get('system/history')
  async getSystemNotificationHistory(
    @Query('limit') limit?: string
  ): Promise<{
    success: boolean;
    data: Notification[];
  }> {
    const notifications = await this.notificationService.getSystemNotificationHistory(
      limit ? parseInt(limit) : 100
    );

    return {
      success: true,
      data: notifications,
    };
  }

  @Post('system/broadcast')
  async broadcastSystemNotification(
    @Body() notification: {
      alertLevel: 'info' | 'warning' | 'error' | 'critical';
      message: string;
      details?: Record<string, any>;
    }
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.notificationService.broadcastToAllUsers({
        type: NotificationType.SYSTEM_ALERT,
        alertLevel: notification.alertLevel,
        message: notification.message,
        details: notification.details,
      });

      return {
        success: true,
        message: 'System notification broadcasted successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('stats')
  async getNotificationStats(): Promise<{
    success: boolean;
    data: {
      activeSubscriptions: number;
      activeChannels: string[];
      channelSubscribers: Array<[string, number]>;
      patternSubscribers: number;
    };
  }> {
    const stats = await this.notificationService.getSubscriptionStats();

    return {
      success: true,
      data: stats,
    };
  }

  @Get('channels')
  async getActiveChannels(): Promise<{
    success: boolean;
    data: string[];
  }> {
    const channels = await this.notificationService.getActiveChannels();

    return {
      success: true,
      data: channels,
    };
  }
}