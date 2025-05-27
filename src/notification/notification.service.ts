/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import {
  Notification,
  NotificationType,
  MessageNotification,
  UserNotification,
  SystemNotification,
  SubscriptionChannels,
  RealtimeEvent,
} from './notification.interface';

type NotificationHandler = (notification: Notification) => void;
type MessageNotificationHandler = (notification: MessageNotification) => void;
type SystemNotificationHandler = (notification: SystemNotification | UserNotification) => void;
type UserNotificationHandler = (notification: UserNotification) => void;
type RealtimeEventHandler = (event: RealtimeEvent) => void;
type AnyNotificationHandler = NotificationHandler | MessageNotificationHandler | SystemNotificationHandler | UserNotificationHandler | RealtimeEventHandler;

@Injectable()
export class NotificationService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private subscribers: Map<string, Redis> = new Map();
  private eventHandlers: Map<string, AnyNotificationHandler[]> = new Map();

  // Channel naming patterns
  private readonly channelPatterns = {
    userNotifications: (userId: string) => `user:${userId}:notifications`,
    messageUpdates: 'message:updates',
    systemAlerts: 'system:alerts',
    userActivity: (userId: string) => `user:${userId}:activity`,
    allUsers: 'users:*',
    globalEvents: 'global:*',
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly userService: UserService
  ) {}

  async onModuleDestroy() {
    // Clean up all subscribers
    for (const [key, subscriber] of this.subscribers) {
      await subscriber.quit();
      this.logger.log(`Subscriber ${key} disconnected`);
    }
    this.subscribers.clear();
  }

  // === PUBLISHING METHODS ===

  async publishMessageNotification(notification: Omit<MessageNotification, 'id' | 'timestamp'>): Promise<void> {
    const fullNotification: MessageNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    // Publish to message updates channel
    await this.publishToChannel(this.channelPatterns.messageUpdates, fullNotification);

    // Publish to user-specific channel if userId is provided
    if (notification.userId) {
      await this.publishToChannel(
        this.channelPatterns.userNotifications(notification.userId),
        fullNotification
      );
    }

    // Store notification for history
    await this.storeNotification(fullNotification);

    this.logger.log(`Published message notification: ${notification.type} for message ${notification.messageId}`);
  }

  async publishUserNotification(notification: Omit<UserNotification, 'id' | 'timestamp'>): Promise<void> {
    const fullNotification: UserNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    // Publish to system alerts (visible to all)
    await this.publishToChannel(this.channelPatterns.systemAlerts, fullNotification);

    // Publish to user-specific channel
    if (notification.userId) {
      await this.publishToChannel(
        this.channelPatterns.userActivity(notification.userId),
        fullNotification
      );
    }

    await this.storeNotification(fullNotification);

    this.logger.log(`Published user notification: ${notification.type} for user ${notification.username}`);
  }

  async publishSystemNotification(notification: Omit<SystemNotification, 'id' | 'timestamp'>): Promise<void> {
    const fullNotification: SystemNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    // Publish to system alerts
    await this.publishToChannel(this.channelPatterns.systemAlerts, fullNotification);

    await this.storeNotification(fullNotification);

    this.logger.log(`Published system notification: ${notification.alertLevel} - ${notification.message}`);
  }

  private async publishToChannel(channel: string, data: any): Promise<void> {
    const message = JSON.stringify(data);
    await this.redisService.publish(channel, message);
  }

  // === SUBSCRIPTION METHODS ===

  async subscribeToUserNotifications(userId: string, handler: (notification: Notification) => void): Promise<string> {
    const channel = this.channelPatterns.userNotifications(userId);
    return this.createSubscription(`user_${userId}`, [channel], handler);
  }

  async subscribeToMessageUpdates(handler: (notification: MessageNotification) => void): Promise<string> {
    const channel = this.channelPatterns.messageUpdates;
    return this.createSubscription('message_updates', [channel], handler);
  }

  async subscribeToSystemAlerts(handler: (notification: SystemNotification | UserNotification) => void): Promise<string> {
    const channel = this.channelPatterns.systemAlerts;
    return this.createSubscription('system_alerts', [channel], handler);
  }

  async subscribeToAllUserActivity(handler: (notification: UserNotification) => void): Promise<string> {
    return this.createPatternSubscription('all_users', ['user:*:activity'], handler);
  }

  async subscribeToGlobalEvents(handler: (event: RealtimeEvent) => void): Promise<string> {
    return this.createPatternSubscription('global_events', ['global:*', 'system:*'], handler);
  }

  private async createSubscription(
    subscriptionId: string,
    channels: string[],
    handler: (data: any) => void
  ): Promise<string> {
    const subscriber = this.redisService.createSubscriber();
    const fullSubscriptionId = `${subscriptionId}_${Date.now()}`;

    // Set up message handler
    subscriber.on('message', (channel: string, message: string) => {
      try {
        const data: unknown = JSON.parse(message);
        handler(data as Parameters<typeof handler>[0]);
      } catch (error) {
        this.logger.error(`Failed to parse message from channel ${channel}:`, error);
      }
    });

    // Subscribe to channels
    await this.redisService.subscribe(subscriber, channels);
    
    // Store subscriber for cleanup
    this.subscribers.set(fullSubscriptionId, subscriber);

    // Store handler for management
    if (!this.eventHandlers.has(fullSubscriptionId)) {
      this.eventHandlers.set(fullSubscriptionId, []);
    }
    this.eventHandlers.get(fullSubscriptionId)?.push(handler);

    this.logger.log(`Created subscription ${fullSubscriptionId} for channels: ${channels.join(', ')}`);
    return fullSubscriptionId;
  }

  private async createPatternSubscription(
    subscriptionId: string,
    patterns: string[],
    handler: (data: any) => void
  ): Promise<string> {
    const subscriber = this.redisService.createSubscriber();
    const fullSubscriptionId = `${subscriptionId}_pattern_${Date.now()}`;

    // Set up pattern message handler
    subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      try {
        const data: unknown = JSON.parse(message);
        if (handler.length === 1 && typeof handler === 'function') {
          const event: RealtimeEvent = {
            channel,
            event: pattern,
            data,
            timestamp: new Date().toISOString(),
          };
          (handler as RealtimeEventHandler)(event);
        } else {
          handler(data as Parameters<typeof handler>[0]);
        }
      } catch (error) {
        this.logger.error(`Failed to parse pattern message from ${pattern}/${channel}:`, error);
      }
    });

    // Subscribe to patterns
    await this.redisService.psubscribe(subscriber, patterns);
    
    this.subscribers.set(fullSubscriptionId, subscriber);

    if (!this.eventHandlers.has(fullSubscriptionId)) {
      this.eventHandlers.set(fullSubscriptionId, []);
    }
    this.eventHandlers.get(fullSubscriptionId)?.push(handler);

    this.logger.log(`Created pattern subscription ${fullSubscriptionId} for patterns: ${patterns.join(', ')}`);
    return fullSubscriptionId;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscriber = this.subscribers.get(subscriptionId);
    if (subscriber) {
      await subscriber.quit();
      this.subscribers.delete(subscriptionId);
      this.eventHandlers.delete(subscriptionId);
      this.logger.log(`Unsubscribed: ${subscriptionId}`);
    }
  }

  // === NOTIFICATION HISTORY ===

  private async storeNotification(notification: Notification): Promise<void> {
    // Store in user's notification history if userId is available
    if (notification.userId) {
      const userNotifKey = `user:${notification.userId}:notification_history`;
      await this.redisService.zadd(userNotifKey, Date.now(), JSON.stringify(notification));
      
      // Keep only last 100 notifications per user
      const count = await this.redisService.zcard(userNotifKey);
      if (count > 100) {
        await this.redisService.zremrangebyrank(userNotifKey, 0, count - 101);
      }
    }

    // Store in global notification history
    const globalNotifKey = 'global:notification_history';
    await this.redisService.zadd(globalNotifKey, Date.now(), JSON.stringify(notification));
    
    // Keep only last 1000 global notifications
    const globalCount = await this.redisService.zcard(globalNotifKey);
    if (globalCount > 1000) {
      await this.redisService.zremrangebyrank(globalNotifKey, 0, globalCount - 1001);
    }
  }

  async getUserNotificationHistory(userId: string, limit: number = 50): Promise<Notification[]> {
    const userNotifKey = `user:${userId}:notification_history`;
    const results = await this.redisService.zrevrangeWithScores(userNotifKey, 0, limit - 1);
    
    return results.map(result => {
      try {
        return JSON.parse(result.member) as Notification;
      } catch (error) {
        this.logger.error(`Failed to parse notification from history:`, error);
        return null;
      }
    }).filter((notif): notif is Notification => notif !== null);
  }

  async getSystemNotificationHistory(limit: number = 100): Promise<Notification[]> {
    const globalNotifKey = 'global:notification_history';
    const results = await this.redisService.zrevrangeWithScores(globalNotifKey, 0, limit - 1);
    
    return results.map(result => {
      try {
        return JSON.parse(result.member) as Notification;
      } catch (error) {
        this.logger.error(`Failed to parse notification from global history:`, error);
        return null;
      }
    }).filter((notif): notif is Notification => notif !== null);
  }

  // === CHANNEL MANAGEMENT ===

  async getActiveChannels(): Promise<string[]> {
    return await this.redisService.pubsubChannels();
  }

  async getChannelSubscriberCount(channels: string[]): Promise<Array<[string, number]>> {
    return await this.redisService.pubsubNumsub(channels);
  }

  async getPatternSubscriberCount(): Promise<number> {
    return await this.redisService.pubsubNumpat();
  }

  // === UTILITY METHODS ===

  async broadcastToAllUsers(notification: Omit<SystemNotification, 'id' | 'timestamp'>): Promise<void> {
    // Get all active users
    const activeUsers = await this.userService.getAllActiveUsers();
    
    // Publish to each user's notification channel
    const publishPromises = activeUsers.map(user => 
      this.publishToChannel(
        this.channelPatterns.userNotifications(user.id),
        {
          ...notification,
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
        }
      )
    );

    await Promise.all(publishPromises);
    
    // Also publish to system alerts
    await this.publishSystemNotification(notification);
    
    this.logger.log(`Broadcasted notification to ${activeUsers.length} users`);
  }

  async getSubscriptionStats(): Promise<{
    activeSubscriptions: number;
    activeChannels: string[];
    channelSubscribers: Array<[string, number]>;
    patternSubscribers: number;
  }> {
    const activeChannels = await this.getActiveChannels();
    const channelSubscribers = await this.getChannelSubscriberCount(activeChannels);
    const patternSubscribers = await this.getPatternSubscriberCount();

    return {
      activeSubscriptions: this.subscribers.size,
      activeChannels,
      channelSubscribers,
      patternSubscribers,
    };
  }
}