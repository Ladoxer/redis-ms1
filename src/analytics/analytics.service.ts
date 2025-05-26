/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import {
  LeaderboardEntry,
  UserLeaderboards,
  TrendingTopic,
  MessageFrequency,
  ActivityMetrics,
  UserActivityScore,
  LeaderboardFilters,
  HourlyStats,
  DailyStats,
  MessageAnalytics
} from './analytics.interface';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  // Redis key patterns for analytics
  private readonly leaderboardKeys = {
    messagesSent: 'leaderboard:messages_sent',
    messagesCompleted: 'leaderboard:messages_completed',
    messagesFailed: 'leaderboard:messages_failed',
    processingSpeed: 'leaderboard:processing_speed',
    overallActivity: 'leaderboard:overall_activity',
    dailyActivity: (date: string) => `leaderboard:daily:${date}`,
    weeklyActivity: (week: string) => `leaderboard:weekly:${week}`,
    monthlyActivity: (month: string) => `leaderboard:monthly:${month}`,
  };

  private readonly analyticsKeys = {
    trendingTopics: 'analytics:trending_topics',
    messageFrequency: 'analytics:message_frequency',
    hourlyStats: (date: string) => `analytics:hourly:${date}`,
    dailyStats: 'analytics:daily_stats',
    wordFrequency: 'analytics:word_frequency',
    messageTimestamps: 'analytics:message_timestamps',
    processingTimes: 'analytics:processing_times',
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly userService: UserService
  ) {}

  // === USER LEADERBOARDS ===

  async updateUserLeaderboard(userId: string, category: string, score: number): Promise<void> {
    const leaderboardKey = this.leaderboardKeys[category as keyof typeof this.leaderboardKeys];
    if (typeof leaderboardKey === 'string') {
      await this.redisService.zadd(leaderboardKey, score, userId);
      
      // Also update daily, weekly, monthly leaderboards
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const weekStr = this.getWeekString(now);
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      await Promise.all([
        this.redisService.zincrby(this.leaderboardKeys.dailyActivity(dateStr), 1, userId),
        this.redisService.zincrby(this.leaderboardKeys.weeklyActivity(weekStr), 1, userId),
        this.redisService.zincrby(this.leaderboardKeys.monthlyActivity(monthStr), 1, userId),
      ]);
    }
  }

  async getLeaderboard(category: string, filters: LeaderboardFilters = {}): Promise<LeaderboardEntry[]> {
    const { timeframe = 'all', limit = 10 } = filters;
    
    let leaderboardKey: string;
    
    if (timeframe === 'all') {
      leaderboardKey = this.leaderboardKeys[category as keyof typeof this.leaderboardKeys] as string;
    } else {
      const now = new Date();
      switch (timeframe) {
        case 'day':
          leaderboardKey = this.leaderboardKeys.dailyActivity(now.toISOString().split('T')[0]);
          break;
        case 'week':
          leaderboardKey = this.leaderboardKeys.weeklyActivity(this.getWeekString(now));
          break;
        case 'month':
          leaderboardKey = this.leaderboardKeys.monthlyActivity(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
          break;
        default:
          leaderboardKey = this.leaderboardKeys[category as keyof typeof this.leaderboardKeys] as string;
      }
    }

    const results = await this.redisService.zrevrangeWithScores(leaderboardKey, 0, limit - 1);
    
    const leaderboard: LeaderboardEntry[] = [];
    for (let i = 0; i < results.length; i++) {
      const { member: userId, score } = results[i];
      const user = await this.userService.getUserById(userId);
      
      if (user) {
        leaderboard.push({
          userId,
          username: user.username,
          score,
          rank: i + 1,
        });
      }
    }

    return leaderboard;
  }

  async getUserLeaderboards(limit: number = 10): Promise<UserLeaderboards> {
    const [messagesSent, messagesCompleted, processingSpeed, overallActivity] = await Promise.all([
      this.getLeaderboard('messagesSent', { limit }),
      this.getLeaderboard('messagesCompleted', { limit }),
      this.getLeaderboard('processingSpeed', { limit }),
      this.getLeaderboard('overallActivity', { limit }),
    ]);

    return {
      messagesSent,
      messagesCompleted,
      processingSpeed,
      overallActivity,
    };
  }

  async getUserRank(userId: string, category: string, timeframe: string = 'all'): Promise<number | null> {
    let leaderboardKey: string;
    
    if (timeframe === 'all') {
      leaderboardKey = this.leaderboardKeys[category as keyof typeof this.leaderboardKeys] as string;
    } else {
      const now = new Date();
      switch (timeframe) {
        case 'day':
          leaderboardKey = this.leaderboardKeys.dailyActivity(now.toISOString().split('T')[0]);
          break;
        case 'week':
          leaderboardKey = this.leaderboardKeys.weeklyActivity(this.getWeekString(now));
          break;
        case 'month':
          leaderboardKey = this.leaderboardKeys.monthlyActivity(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
          break;
        default:
          leaderboardKey = this.leaderboardKeys[category as keyof typeof this.leaderboardKeys] as string;
      }
    }

    const rank = await this.redisService.zrevrank(leaderboardKey, userId);
    return rank !== null ? rank + 1 : null; // Convert to 1-based ranking
  }

  // === TRENDING TOPICS ===

  async trackMessageContent(content: string, messageId: string, priority: string): Promise<void> {
    const words = this.extractWords(content);
    const timestamp = new Date().toISOString();

    // Track individual words for trending topics
    for (const word of words) {
      if (word.length > 3) { // Only track meaningful words
        await this.redisService.zincrby(this.analyticsKeys.trendingTopics, 1, word);
        await this.redisService.zincrby(this.analyticsKeys.wordFrequency, 1, word);
      }
    }

    // Track full message frequency
    const contentHash = Buffer.from(content).toString('base64');
    await this.redisService.zadd(this.analyticsKeys.messageFrequency, Date.now(), JSON.stringify({
      messageId,
      content: content.substring(0, 100), // Limit content length
      priority,
      timestamp,
      hash: contentHash,
    }));

    // Track message timestamp for time-based analysis
    await this.redisService.zadd(this.analyticsKeys.messageTimestamps, Date.now(), messageId);
  }

  async getTrendingTopics(limit: number = 10): Promise<TrendingTopic[]> {
    const results = await this.redisService.zrevrangeWithScores(this.analyticsKeys.trendingTopics, 0, limit - 1);
    
    return results.map((result, index) => ({
      topic: result.member,
      frequency: result.score,
      rank: index + 1,
      lastSeen: new Date().toISOString(), // Could be enhanced to track actual last seen
    }));
  }

  async getWordFrequency(limit: number = 20): Promise<Array<{word: string, count: number}>> {
    const results = await this.redisService.zrevrangeWithScores(this.analyticsKeys.wordFrequency, 0, limit - 1);
    
    return results.map(result => ({
      word: result.member,
      count: result.score,
    }));
  }

  // === TIME-BASED ANALYTICS ===

  async recordHourlyStats(hour: number, messageCount: number, completedCount: number, failedCount: number, avgProcessingTime: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const hourlyKey = this.analyticsKeys.hourlyStats(today);
    
    const statsData = JSON.stringify({
      hour,
      messageCount,
      completedCount,
      failedCount,
      averageProcessingTime: avgProcessingTime,
    });

    await this.redisService.zadd(hourlyKey, hour, statsData);
    await this.redisService.expire(hourlyKey, 86400 * 7); // Keep for 7 days
  }

  async getHourlyStats(date?: string): Promise<HourlyStats[]> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const hourlyKey = this.analyticsKeys.hourlyStats(targetDate);
    
    const results = await this.redisService.zrangeWithScores(hourlyKey, 0, -1);
    
    return results.map(result => {
      try {
        return JSON.parse(result.member) as HourlyStats;
      } catch (_) {
        return {
          hour: result.score,
          messageCount: 0,
          completedCount: 0,
          failedCount: 0,
          averageProcessingTime: 0,
        };
      }
    });
  }

  async recordDailyStats(stats: DailyStats): Promise<void> {
    const timestamp = new Date(stats.date).getTime();
    await this.redisService.zadd(this.analyticsKeys.dailyStats, timestamp, JSON.stringify(stats));
  }

  async getDailyStats(days: number = 30): Promise<DailyStats[]> {
    const results = await this.redisService.zrevrangeWithScores(this.analyticsKeys.dailyStats, 0, days - 1);
    
    return results.map(result => {
      try {
        return JSON.parse(result.member) as DailyStats;
      } catch (_) {
        return {
          date: new Date(result.score).toISOString().split('T')[0],
          messageCount: 0,
          completedCount: 0,
          failedCount: 0,
          activeUsers: 0,
          averageProcessingTime: 0,
        };
      }
    });
  }

  // === PROCESSING TIME ANALYTICS ===

  async recordProcessingTime(messageId: string, processingTime: number): Promise<void> {
    await this.redisService.zadd(this.analyticsKeys.processingTimes, processingTime, messageId);
    
    // Keep only last 10000 processing times to prevent unlimited growth
    const count = await this.redisService.zcard(this.analyticsKeys.processingTimes);
    if (count > 10000) {
      await this.redisService.zremrangebyrank(this.analyticsKeys.processingTimes, 0, count - 10001);
    }
  }

  async getProcessingTimeStats(): Promise<{
    average: number;
    median: number;
    p95: number;
    p99: number;
    fastest: number;
    slowest: number;
  }> {
    const count = await this.redisService.zcard(this.analyticsKeys.processingTimes);
    
    if (count === 0) {
      return {
        average: 0,
        median: 0,
        p95: 0,
        p99: 0,
        fastest: 0,
        slowest: 0,
      };
    }

    const [allTimes, medianTimes, p95Times, p99Times, fastest, slowest] = await Promise.all([
      this.redisService.zrangeWithScores(this.analyticsKeys.processingTimes, 0, -1),
      this.redisService.zrangeWithScores(this.analyticsKeys.processingTimes, Math.floor(count * 0.5), Math.floor(count * 0.5)),
      this.redisService.zrangeWithScores(this.analyticsKeys.processingTimes, Math.floor(count * 0.95), Math.floor(count * 0.95)),
      this.redisService.zrangeWithScores(this.analyticsKeys.processingTimes, Math.floor(count * 0.99), Math.floor(count * 0.99)),
      this.redisService.zrangeWithScores(this.analyticsKeys.processingTimes, 0, 0),
      this.redisService.zrangeWithScores(this.analyticsKeys.processingTimes, -1, -1),
    ]);

    const average = allTimes.reduce((sum, item) => sum + item.score, 0) / allTimes.length;

    return {
      average,
      median: medianTimes[0]?.score || 0,
      p95: p95Times[0]?.score || 0,
      p99: p99Times[0]?.score || 0,
      fastest: fastest[0]?.score || 0,
      slowest: slowest[0]?.score || 0,
    };
  }

  // === COMPREHENSIVE ANALYTICS ===

  async getActivityMetrics(): Promise<ActivityMetrics> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000).getTime();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();

    const [
      totalMessages,
      messagesLast24Hours,
      messagesLast7Days,
      topUsers,
      trendingTopics,
    ] = await Promise.all([
      this.redisService.zcard(this.analyticsKeys.messageTimestamps),
      this.redisService.zcount(this.analyticsKeys.messageTimestamps, last24Hours, '+inf'),
      this.redisService.zcount(this.analyticsKeys.messageTimestamps, last7Days, '+inf'),
      this.getLeaderboard('overallActivity', { limit: 5 }),
      this.getTrendingTopics(5),
    ]);

    // Calculate peak hour and day (simplified)
    const hourlyStats = await this.getHourlyStats(today);
    const peakHour = hourlyStats.reduce((max, stat) => 
      stat.messageCount > max.messageCount ? stat : max, 
      { hour: 0, messageCount: 0 }
    ).hour;

    return {
      totalMessages,
      messagesLast24Hours,
      messagesLast7Days,
      peakHour,
      peakDay: now.toLocaleDateString('en-US', { weekday: 'long' }),
      averageMessagesPerHour: Math.round(messagesLast24Hours / 24),
      topUsers,
      trendingTopics,
    };
  }

  // === UTILITY METHODS ===

  private extractWords(content: string): string[] {
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  private getWeekString(date: Date): string {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    return startOfWeek.toISOString().split('T')[0];
  }

  // === CLEANUP METHODS ===

  async cleanupOldAnalytics(daysToKeep: number = 30): Promise<void> {
    const cutoffTime = new Date().getTime() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    await Promise.all([
      this.redisService.zremrangebyscore(this.analyticsKeys.messageTimestamps, '-inf', cutoffTime),
      this.redisService.zremrangebyscore(this.analyticsKeys.messageFrequency, '-inf', cutoffTime),
      this.redisService.zremrangebyscore(this.analyticsKeys.dailyStats, '-inf', cutoffTime),
    ]);

    this.logger.log(`Cleaned up analytics data older than ${daysToKeep} days`);
  }
}