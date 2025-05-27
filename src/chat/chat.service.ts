import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import {
  ChatChannel,
  ChatMember,
  ChatMessage,
  CreateChannelDto,
  SendMessageDto,
  ChannelInfo,
  NotificationType,
  PresenceInfo,
} from '../notification/notification.interface';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private chatSubscribers: Map<string, Redis> = new Map();

  // Redis key patterns for chat
  private readonly chatKeys = {
    channel: (channelId: string) => `chat:channel:${channelId}`,
    channelMembers: (channelId: string) => `chat:channel:${channelId}:members`,
    channelMessages: (channelId: string) => `chat:channel:${channelId}:messages`,
    userChannels: (userId: string) => `chat:user:${userId}:channels`,
    channelList: 'chat:channels',
    presence: (userId: string) => `chat:presence:${userId}`,
    onlineUsers: 'chat:online_users',
  };

  // Pub/Sub channels
  private readonly pubsubChannels = {
    channel: (channelId: string) => `chat:${channelId}`,
    presence: 'chat:presence',
    system: 'chat:system',
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly userService: UserService
  ) {}

  // === CHANNEL MANAGEMENT ===

  async createChannel(creatorId: string, createChannelDto: CreateChannelDto): Promise<ChatChannel> {
    const { name, description, isPrivate = false, initialMembers = [] } = createChannelDto;

    // Check if creator exists
    const creator = await this.userService.getUserById(creatorId);
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    // Generate channel ID
    const channelId = `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create channel object
    const channel: ChatChannel = {
      id: channelId,
      name,
      description,
      isPrivate,
      createdBy: creatorId,
      createdAt: new Date().toISOString(),
      memberCount: 1, // Creator is automatically a member
      lastActivity: new Date().toISOString(),
    };

    // Store channel
    const channelKey = this.chatKeys.channel(channelId);
    await this.redisService.hmset(channelKey, {
      id: channel.id,
      name: channel.name,
      description: channel.description || '',
      isPrivate: channel.isPrivate.toString(),
      createdBy: channel.createdBy,
      createdAt: channel.createdAt,
      memberCount: channel.memberCount.toString(),
      lastActivity: channel.lastActivity,
    });

    // Add to channel list
    await this.redisService.zadd(this.chatKeys.channelList, Date.now(), channelId);

    // Add creator as admin member
    await this.addMemberToChannel(channelId, creatorId, 'admin');

    // Add initial members
    for (const memberId of initialMembers) {
      if (memberId !== creatorId) {
        await this.addMemberToChannel(channelId, memberId, 'member');
      }
    }

    // Publish channel creation event
    await this.publishToChannel(this.pubsubChannels.system, {
      type: 'channel_created',
      channelId,
      channelName: name,
      createdBy: creator.username,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Created channel: ${name} (${channelId}) by ${creator.username}`);
    return channel;
  }

  async getChannel(channelId: string): Promise<ChatChannel | null> {
    const channelKey = this.chatKeys.channel(channelId);
    const channelData = await this.redisService.hgetall(channelKey);

    if (Object.keys(channelData).length === 0) {
      return null;
    }

    return {
      id: channelData.id,
      name: channelData.name,
      description: channelData.description || undefined,
      isPrivate: channelData.isPrivate === 'true',
      createdBy: channelData.createdBy,
      createdAt: channelData.createdAt,
      memberCount: parseInt(channelData.memberCount) || 0,
      lastActivity: channelData.lastActivity,
    };
  }

  async getAllChannels(includePrivate: boolean = false): Promise<ChatChannel[]> {
    const channelIds = await this.redisService.zrevrange(this.chatKeys.channelList, 0, -1);
    
    const channels: ChatChannel[] = [];
    for (const channelId of channelIds) {
      const channel = await this.getChannel(channelId);
      if (channel && (includePrivate || !channel.isPrivate)) {
        channels.push(channel);
      }
    }

    return channels;
  }

  async getUserChannels(userId: string): Promise<ChatChannel[]> {
    const channelIds = await this.redisService.smembers(this.chatKeys.userChannels(userId));
    
    const channels: ChatChannel[] = [];
    for (const channelId of channelIds) {
      const channel = await this.getChannel(channelId);
      if (channel) {
        channels.push(channel);
      }
    }

    return channels.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  }

  // === MEMBER MANAGEMENT ===

  async addMemberToChannel(channelId: string, userId: string, role: 'admin' | 'moderator' | 'member' = 'member'): Promise<void> {
    const [channel, user] = await Promise.all([
      this.getChannel(channelId),
      this.userService.getUserById(userId),
    ]);

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create member object
    const member: ChatMember = {
      userId,
      username: user.username,
      joinedAt: new Date().toISOString(),
      role,
      isOnline: false, // Will be updated by presence system
      lastSeen: new Date().toISOString(),
    };

    // Add member to channel
    const memberKey = `${channelId}:${userId}`;
    await this.redisService.hset(this.chatKeys.channelMembers(channelId), memberKey, JSON.stringify(member));

    // Add channel to user's channel list
    await this.redisService.sadd(this.chatKeys.userChannels(userId), channelId);

    // Update channel member count
    await this.redisService.hincrby(this.chatKeys.channel(channelId), 'memberCount', 1);

    // Publish member joined event
    await this.publishToChannel(this.pubsubChannels.channel(channelId), {
      type: 'member_joined',
      channelId,
      userId,
      username: user.username,
      role,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Added ${user.username} to channel ${channelId} as ${role}`);
  }

  async removeMemberFromChannel(channelId: string, userId: string, removedBy?: string): Promise<void> {
    const [channel, user] = await Promise.all([
      this.getChannel(channelId),
      this.userService.getUserById(userId),
    ]);

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Remove member from channel
    const memberKey = `${channelId}:${userId}`;
    await this.redisService.hdel(this.chatKeys.channelMembers(channelId), memberKey);

    // Remove channel from user's channel list
    await this.redisService.srem(this.chatKeys.userChannels(userId), channelId);

    // Update channel member count
    await this.redisService.hincrby(this.chatKeys.channel(channelId), 'memberCount', -1);

    // Publish member left event
    await this.publishToChannel(this.pubsubChannels.channel(channelId), {
      type: 'member_left',
      channelId,
      userId,
      username: user?.username || 'Unknown User',
      removedBy,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Removed ${user?.username || userId} from channel ${channelId}`);
  }

  async getChannelMembers(channelId: string): Promise<ChatMember[]> {
    const memberData = await this.redisService.hgetall(this.chatKeys.channelMembers(channelId));
    
    const members: ChatMember[] = [];
    for (const memberJson of Object.values(memberData)) {
      try {
        const member = JSON.parse(memberJson) as ChatMember;
        // Update online status from presence
        const presence = await this.getUserPresence(member.userId);
        member.isOnline = presence?.status === 'online';
        members.push(member);
      } catch (error) {
        this.logger.error(`Failed to parse member data:`, error);
      }
    }

    return members.sort((a, b) => a.username.localeCompare(b.username));
  }

  async isUserMemberOfChannel(channelId: string, userId: string): Promise<boolean> {
    const memberKey = `${channelId}:${userId}`;
    return (await this.redisService.hexists(this.chatKeys.channelMembers(channelId), memberKey)) === 1;
  }

  // === MESSAGING ===

  async sendMessage(channelId: string, senderId: string, messageDto: SendMessageDto): Promise<ChatMessage> {
    const { message, mentions = [], replyTo } = messageDto;

    // Verify user is a member of the channel
    const isMember = await this.isUserMemberOfChannel(channelId, senderId);
    if (!isMember) {
      throw new ForbiddenException('User is not a member of this channel');
    }

    const [channel, sender] = await Promise.all([
      this.getChannel(channelId),
      this.userService.getUserById(senderId),
    ]);

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    // Create chat message
    const chatMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: NotificationType.CHAT_MESSAGE,
      channelId,
      channelName: channel.name,
      userId: senderId,
      username: sender.username,
      message,
      mentions,
      replyTo,
      timestamp: new Date().toISOString(),
    };

    // Store message in channel history
    await this.redisService.zadd(
      this.chatKeys.channelMessages(channelId),
      Date.now(),
      JSON.stringify(chatMessage)
    );

    // Keep only last 1000 messages per channel
    const messageCount = await this.redisService.zcard(this.chatKeys.channelMessages(channelId));
    if (messageCount > 1000) {
      await this.redisService.zremrangebyrank(this.chatKeys.channelMessages(channelId), 0, messageCount - 1001);
    }

    // Update channel last activity
    await this.redisService.hset(this.chatKeys.channel(channelId), 'lastActivity', chatMessage.timestamp);

    // Publish message to channel subscribers
    await this.publishToChannel(this.pubsubChannels.channel(channelId), chatMessage);

    // Send notifications to mentioned users
    if (mentions.length > 0) {
      await this.notifyMentionedUsers(chatMessage, mentions);
    }

    this.logger.log(`Message sent in channel ${channelId} by ${sender.username}`);
    return chatMessage;
  }

  async getChannelMessages(channelId: string, limit: number = 50, before?: string): Promise<ChatMessage[]> {
    let maxScore = '+inf';
    if (before) {
      // Convert before timestamp to score
      maxScore = new Date(before).getTime().toString();
    }

    const results = await this.redisService.zrevrangebyscore(
      this.chatKeys.channelMessages(channelId),
      maxScore,
      '-inf',
      true,
      { offset: 0, count: limit }
    );

    const messages: ChatMessage[] = [];
    for (let i = 0; i < results.length; i += 2) {
      try {
        const message = JSON.parse(results[i]) as ChatMessage;
        messages.push(message);
      } catch (error) {
        this.logger.error(`Failed to parse chat message:`, error);
      }
    }

    return messages;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async notifyMentionedUsers(message: ChatMessage, mentions: string[]): Promise<void> {
    for (const mentionedUserId of mentions) {
      // You would integrate with NotificationService here
      this.logger.log(`User ${mentionedUserId} mentioned in channel ${message.channelId}`);
    }
  }

  // === REAL-TIME SUBSCRIPTIONS ===

  async subscribeToChannel(channelId: string, userId: string, handler: (message: ChatMessage) => void): Promise<string> {
    // Verify user is a member
    const isMember = await this.isUserMemberOfChannel(channelId, userId);
    if (!isMember) {
      throw new ForbiddenException('User is not a member of this channel');
    }

    const subscriber = this.redisService.createSubscriber();
    const subscriptionId = `chat_${channelId}_${userId}_${Date.now()}`;
    const channel = this.pubsubChannels.channel(channelId);

    subscriber.on('message', (receivedChannel: string, message: string) => {
      if (receivedChannel === channel) {
        try {
          const chatMessage = JSON.parse(message) as ChatMessage;
          handler(chatMessage);
        } catch (error) {
          this.logger.error(`Failed to parse chat message:`, error);
        }
      }
    });

    await this.redisService.subscribe(subscriber, [channel]);
    this.chatSubscribers.set(subscriptionId, subscriber);

    this.logger.log(`User ${userId} subscribed to channel ${channelId}`);
    return subscriptionId;
  }

  async unsubscribeFromChannel(subscriptionId: string): Promise<void> {
    const subscriber = this.chatSubscribers.get(subscriptionId);
    if (subscriber) {
      await subscriber.quit();
      this.chatSubscribers.delete(subscriptionId);
      this.logger.log(`Unsubscribed: ${subscriptionId}`);
    }
  }

  // === PRESENCE SYSTEM ===

  async setUserPresence(userId: string, status: 'online' | 'away' | 'busy' | 'offline', currentChannel?: string): Promise<void> {
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const presence: PresenceInfo = {
      userId,
      username: user.username,
      status,
      lastSeen: new Date().toISOString(),
      currentChannel,
    };

    await this.redisService.hset(
      this.chatKeys.presence(userId),
      'presence',
      JSON.stringify(presence)
    );

    // Set expiration for presence (auto-offline after 5 minutes of inactivity)
    await this.redisService.expire(this.chatKeys.presence(userId), 300);

    // Add/remove from online users set
    if (status === 'online') {
      await this.redisService.sadd(this.chatKeys.onlineUsers, userId);
    } else {
      await this.redisService.srem(this.chatKeys.onlineUsers, userId);
    }

    // Publish presence update
    await this.publishToChannel(this.pubsubChannels.presence, presence);

    this.logger.log(`User ${user.username} presence updated: ${status}`);
  }

  async getUserPresence(userId: string): Promise<PresenceInfo | null> {
    const presenceData = await this.redisService.hget(this.chatKeys.presence(userId), 'presence');
    if (!presenceData) {
      return null;
    }

    try {
      return JSON.parse(presenceData) as PresenceInfo;
    } catch (error) {
      this.logger.error(`Failed to parse presence data for user ${userId}:`, error);
      return null;
    }
  }

  async getOnlineUsers(): Promise<PresenceInfo[]> {
    const onlineUserIds = await this.redisService.smembers(this.chatKeys.onlineUsers);
    
    const presences: PresenceInfo[] = [];
    for (const userId of onlineUserIds) {
      const presence = await this.getUserPresence(userId);
      if (presence) {
        presences.push(presence);
      }
    }

    return presences.sort((a, b) => a.username.localeCompare(b.username));
  }

  // === CHANNEL INFO ===

  async getChannelInfo(channelId: string, userId: string): Promise<ChannelInfo> {
    // Verify user is a member
    const isMember = await this.isUserMemberOfChannel(channelId, userId);
    if (!isMember) {
      throw new ForbiddenException('User is not a member of this channel');
    }

    const [channel, members, recentMessages] = await Promise.all([
      this.getChannel(channelId),
      this.getChannelMembers(channelId),
      this.getChannelMessages(channelId, 20),
    ]);

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Calculate unread count (simplified - you might want to track last read timestamp)
    const unreadCount = 0; // Implement based on your needs

    return {
      channel,
      members,
      recentMessages,
      unreadCount,
    };
  }

  // === UTILITY METHODS ===

  private async publishToChannel(channel: string, data: any): Promise<void> {
    const message = JSON.stringify(data);
    await this.redisService.publish(channel, message);
  }

  async getChatStats(): Promise<{
    totalChannels: number;
    totalMessages: number;
    activeSubscriptions: number;
    onlineUsers: number;
  }> {
    const [totalChannels, activeSubscriptions, onlineUsers] = await Promise.all([
      this.redisService.zcard(this.chatKeys.channelList),
      Promise.resolve(this.chatSubscribers.size),
      this.redisService.scard(this.chatKeys.onlineUsers),
    ]);

    // Calculate total messages across all channels
    const channelIds = await this.redisService.zrange(this.chatKeys.channelList, 0, -1);
    let totalMessages = 0;
    for (const channelId of channelIds) {
      const messageCount = await this.redisService.zcard(this.chatKeys.channelMessages(channelId));
      totalMessages += messageCount;
    }

    return {
      totalChannels,
      totalMessages,
      activeSubscriptions,
      onlineUsers,
    };
  }

  async cleanupInactivePresence(): Promise<void> {
    // This method can be called periodically to clean up inactive presence data
    const onlineUserIds = await this.redisService.smembers(this.chatKeys.onlineUsers);
    
    for (const userId of onlineUserIds) {
      const exists = await this.redisService.exists(this.chatKeys.presence(userId));
      if (!exists) {
        // Remove from online users if presence expired
        await this.redisService.srem(this.chatKeys.onlineUsers, userId);
      }
    }
  }
}