/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  UserProfile,
  UserPreferences,
  UserStats,
  CreateUserDto,
  UpdateUserDto,
  UserRole,
  UserStatus,
  UserWithStats,
} from './user.interface';

// Type guards for safe JSON parsing
function isUserProfile(obj: unknown): obj is UserProfile {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as UserProfile).id === 'string' &&
    typeof (obj as UserProfile).username === 'string' &&
    typeof (obj as UserProfile).email === 'string'
  );
}

function isUserPreferences(obj: unknown): obj is UserPreferences {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as UserPreferences).userId === 'string'
  );
}

function isUserStats(obj: unknown): obj is UserStats {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as UserStats).userId === 'string'
  );
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  // Redis key patterns
  private readonly userProfileKey = (userId: string) =>
    `user:profile:${userId}`;
  private readonly userPreferencesKey = (userId: string) =>
    `user:preferences:${userId}`;
  private readonly userStatsKey = (userId: string) => `user:stats:${userId}`;
  private readonly usernameToIdKey = 'username_to_id';
  private readonly emailToIdKey = 'email_to_id';
  private readonly activeUsersKey = 'active_users';
  private readonly userLoginKey = (userId: string) => `user:login:${userId}`;

  constructor(private readonly redisService: RedisService) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserProfile> {
    const {
      username,
      email,
      firstName,
      lastName,
      role = UserRole.USER,
      bio,
    } = createUserDto;

    // Generate unique user ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if username or email already exists
    const existingUserByUsername = await this.redisService.hget(
      this.usernameToIdKey,
      username,
    );
    const existingUserByEmail = await this.redisService.hget(
      this.emailToIdKey,
      email,
    );

    if (existingUserByUsername) {
      throw new ConflictException('Username already exists');
    }

    if (existingUserByEmail) {
      throw new ConflictException('Email already exists');
    }

    // Create user profile
    const userProfile: UserProfile = {
      id: userId,
      username,
      email,
      firstName,
      lastName,
      role,
      status: UserStatus.ACTIVE,
      createdAt: new Date().toISOString(),
      bio,
    };

    // Store user profile as hash
    const profileKey = this.userProfileKey(userId);
    await this.redisService.hmset(profileKey, {
      id: userProfile.id,
      username: userProfile.username,
      email: userProfile.email,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      role: userProfile.role,
      status: userProfile.status,
      createdAt: userProfile.createdAt,
      bio: userProfile.bio || '',
    });

    // Create mappings
    await this.redisService.hset(this.usernameToIdKey, username, userId);
    await this.redisService.hset(this.emailToIdKey, email, userId);

    // Add to active users set
    await this.redisService.sadd(this.activeUsersKey, userId);

    // Initialize user preferences
    await this.createDefaultPreferences(userId);

    // Initialize user stats
    await this.createDefaultStats(userId);

    this.logger.log(`User created: ${userId} (${username})`);
    return userProfile;
  }

  async getUserById(userId: string): Promise<UserProfile | null> {
    const profileKey = this.userProfileKey(userId);
    const profileData = await this.redisService.hgetall(profileKey);

    if (Object.keys(profileData).length === 0) {
      return null;
    }

    return {
      id: profileData.id,
      username: profileData.username,
      email: profileData.email,
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      role: profileData.role as UserRole,
      status: profileData.status as UserStatus,
      createdAt: profileData.createdAt,
      lastLoginAt: profileData.lastLoginAt || undefined,
      profilePicture: profileData.profilePicture || undefined,
      bio: profileData.bio || undefined,
    };
  }

  async getUserByUsername(username: string): Promise<UserProfile | null> {
    const userId = await this.redisService.hget(this.usernameToIdKey, username);
    if (!userId) {
      return null;
    }
    return this.getUserById(userId);
  }

  async getUserByEmail(email: string): Promise<UserProfile | null> {
    const userId = await this.redisService.hget(this.emailToIdKey, email);
    if (!userId) {
      return null;
    }
    return this.getUserById(userId);
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserProfile | null> {
    const existingUser = await this.getUserById(userId);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const profileKey = this.userProfileKey(userId);
    const updateFields: Record<string, string> = {};

    if (updateUserDto.firstName)
      updateFields.firstName = updateUserDto.firstName;
    if (updateUserDto.lastName) updateFields.lastName = updateUserDto.lastName;
    if (updateUserDto.bio !== undefined) updateFields.bio = updateUserDto.bio;
    if (updateUserDto.profilePicture)
      updateFields.profilePicture = updateUserDto.profilePicture;

    if (Object.keys(updateFields).length > 0) {
      await this.redisService.hmset(profileKey, updateFields);
    }

    return this.getUserById(userId);
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const preferencesKey = this.userPreferencesKey(userId);
    const preferencesData = await this.redisService.hgetall(preferencesKey);

    if (Object.keys(preferencesData).length === 0) {
      return null;
    }

    try {
      return {
        userId: preferencesData.userId,
        notifications: JSON.parse(preferencesData.notifications) as {
          email: boolean;
          push: boolean;
          sms: boolean;
        },
        messageSettings: JSON.parse(preferencesData.messageSettings) as {
          defaultPriority: string;
          autoRetry: boolean;
          maxRetries: number;
        },
        theme: preferencesData.theme as 'light' | 'dark' | 'auto',
        language: preferencesData.language,
        timezone: preferencesData.timezone,
        privacy: JSON.parse(preferencesData.privacy) as {
          profileVisible: boolean;
          showEmail: boolean;
          showLastSeen: boolean;
        },
      };
    } catch (_) {
      this.logger.error(`Failed to parse preferences for user ${userId}`);
      return null;
    }
  }

  async updateUserPreferences(
    userId: string,
    preferences: Partial<UserPreferences>,
  ): Promise<UserPreferences | null> {
    const existingPreferences = await this.getUserPreferences(userId);
    if (!existingPreferences) {
      throw new NotFoundException('User preferences not found');
    }

    const preferencesKey = this.userPreferencesKey(userId);
    const updateFields: Record<string, string> = {};

    if (preferences.notifications) {
      updateFields.notifications = JSON.stringify(preferences.notifications);
    }
    if (preferences.messageSettings) {
      updateFields.messageSettings = JSON.stringify(
        preferences.messageSettings,
      );
    }
    if (preferences.theme) updateFields.theme = preferences.theme;
    if (preferences.language) updateFields.language = preferences.language;
    if (preferences.timezone) updateFields.timezone = preferences.timezone;
    if (preferences.privacy) {
      updateFields.privacy = JSON.stringify(preferences.privacy);
    }

    if (Object.keys(updateFields).length > 0) {
      await this.redisService.hmset(preferencesKey, updateFields);
    }

    return this.getUserPreferences(userId);
  }

  async getUserStats(userId: string): Promise<UserStats | null> {
    const statsKey = this.userStatsKey(userId);
    const statsData = await this.redisService.hgetall(statsKey);

    if (Object.keys(statsData).length === 0) {
      return null;
    }

    return {
      userId: statsData.userId,
      totalMessagesSent: parseInt(statsData.totalMessagesSent) || 0,
      totalMessagesProcessed: parseInt(statsData.totalMessagesProcessed) || 0,
      totalCompletedMessages: parseInt(statsData.totalCompletedMessages) || 0,
      totalFailedMessages: parseInt(statsData.totalFailedMessages) || 0,
      averageProcessingTime: parseFloat(statsData.averageProcessingTime) || 0,
      lastActivityAt: statsData.lastActivityAt,
      loginCount: parseInt(statsData.loginCount) || 0,
    };
  }

  async incrementUserStat(
    userId: string,
    statField: string,
    increment: number = 1,
  ): Promise<void> {
    const statsKey = this.userStatsKey(userId);
    await this.redisService.hincrby(statsKey, statField, increment);
    await this.redisService.hset(
      statsKey,
      'lastActivityAt',
      new Date().toISOString(),
    );
  }

  async recordUserLogin(userId: string): Promise<void> {
    const profileKey = this.userProfileKey(userId);
    const statsKey = this.userStatsKey(userId);
    const loginTime = new Date().toISOString();

    // Update last login time in profile
    await this.redisService.hset(profileKey, 'lastLoginAt', loginTime);

    // Increment login count in stats
    await this.redisService.hincrby(statsKey, 'loginCount', 1);
    await this.redisService.hset(statsKey, 'lastActivityAt', loginTime);

    // Store detailed login info (could be used for security/analytics)
    const loginKey = this.userLoginKey(userId);
    await this.redisService.set(loginKey, loginTime, 86400); // Expire after 24 hours
  }

  async getUserWithStats(userId: string): Promise<UserWithStats | null> {
    const [profile, preferences, stats] = await Promise.all([
      this.getUserById(userId),
      this.getUserPreferences(userId),
      this.getUserStats(userId),
    ]);

    if (!profile || !preferences || !stats) {
      return null;
    }

    return { profile, preferences, stats };
  }

  async getAllActiveUsers(): Promise<UserProfile[]> {
    const activeUserIds = await this.redisService.smembers(this.activeUsersKey);

    const users = await Promise.all(
      activeUserIds.map((userId) => this.getUserById(userId)),
    );

    return users.filter((user): user is UserProfile => user !== null);
  }

  async deactivateUser(userId: string): Promise<void> {
    const profileKey = this.userProfileKey(userId);
    await this.redisService.hset(profileKey, 'status', UserStatus.INACTIVE);
    await this.redisService.srem(this.activeUsersKey, userId);
    this.logger.log(`User deactivated: ${userId}`);
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Remove all user data
    await Promise.all([
      this.redisService.del(this.userProfileKey(userId)),
      this.redisService.del(this.userPreferencesKey(userId)),
      this.redisService.del(this.userStatsKey(userId)),
      this.redisService.del(this.userLoginKey(userId)),
      this.redisService.hdel(this.usernameToIdKey, user.username),
      this.redisService.hdel(this.emailToIdKey, user.email),
      this.redisService.srem(this.activeUsersKey, userId),
    ]);

    this.logger.log(`User deleted: ${userId} (${user.username})`);
  }

  private async createDefaultPreferences(userId: string): Promise<void> {
    const preferencesKey = this.userPreferencesKey(userId);

    const defaultPreferences = {
      userId,
      notifications: JSON.stringify({
        email: true,
        push: true,
        sms: false,
      }),
      messageSettings: JSON.stringify({
        defaultPriority: 'normal',
        autoRetry: true,
        maxRetries: 3,
      }),
      theme: 'auto',
      language: 'en',
      timezone: 'UTC',
      privacy: JSON.stringify({
        profileVisible: true,
        showEmail: false,
        showLastSeen: true,
      }),
    };

    await this.redisService.hmset(preferencesKey, defaultPreferences);
  }

  private async createDefaultStats(userId: string): Promise<void> {
    const statsKey = this.userStatsKey(userId);

    const defaultStats = {
      userId,
      totalMessagesSent: '0',
      totalMessagesProcessed: '0',
      totalCompletedMessages: '0',
      totalFailedMessages: '0',
      averageProcessingTime: '0',
      lastActivityAt: new Date().toISOString(),
      loginCount: '0',
    };

    await this.redisService.hmset(statsKey, defaultStats);
  }
}
