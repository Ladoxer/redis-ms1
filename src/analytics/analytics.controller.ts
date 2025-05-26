import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Delete,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import {
  UserLeaderboards,
  TrendingTopic,
  ActivityMetrics,
  LeaderboardFilters,
  HourlyStats,
  DailyStats,
} from './analytics.interface';

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

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // === LEADERBOARDS ===

  @Get('leaderboards')
  async getUserLeaderboards(
    @Query('limit') limit?: string
  ): Promise<{
    success: boolean;
    data: UserLeaderboards;
  }> {
    const leaderboards = await this.analyticsService.getUserLeaderboards(
      limit ? parseInt(limit) : 10
    );

    return {
      success: true,
      data: leaderboards,
    };
  }

  @Get('leaderboard/:category')
  async getLeaderboard(
    @Param('category') category: string,
    @Query('timeframe') timeframe?: 'day' | 'week' | 'month' | 'all',
    @Query('limit') limit?: string
  ): Promise<{
    success: boolean;
    data: any[];
  }> {
    const filters: LeaderboardFilters = {
      timeframe: timeframe || 'all',
      limit: limit ? parseInt(limit) : 10,
    };

    const leaderboard = await this.analyticsService.getLeaderboard(category, filters);

    return {
      success: true,
      data: leaderboard,
    };
  }

  @Get('user/:userId/rank/:category')
  async getUserRank(
    @Param('userId') userId: string,
    @Param('category') category: string,
    @Query('timeframe') timeframe?: string
  ): Promise<{
    success: boolean;
    data: {
      userId: string;
      category: string;
      rank: number | null;
      timeframe: string;
    };
  }> {
    const rank = await this.analyticsService.getUserRank(
      userId,
      category,
      timeframe || 'all'
    );

    return {
      success: true,
      data: {
        userId,
        category,
        rank,
        timeframe: timeframe || 'all',
      },
    };
  }

  // === TRENDING TOPICS ===

  @Get('trending-topics')
  async getTrendingTopics(
    @Query('limit') limit?: string
  ): Promise<{
    success: boolean;
    data: TrendingTopic[];
  }> {
    const topics = await this.analyticsService.getTrendingTopics(
      limit ? parseInt(limit) : 10
    );

    return {
      success: true,
      data: topics,
    };
  }

  @Get('word-frequency')
  async getWordFrequency(
    @Query('limit') limit?: string
  ): Promise<{
    success: boolean;
    data: Array<{word: string; count: number}>;
  }> {
    const wordFreq = await this.analyticsService.getWordFrequency(
      limit ? parseInt(limit) : 20
    );

    return {
      success: true,
      data: wordFreq,
    };
  }

  // === TIME-BASED ANALYTICS ===

  @Get('hourly-stats')
  async getHourlyStats(
    @Query('date') date?: string
  ): Promise<{
    success: boolean;
    data: HourlyStats[];
  }> {
    const stats = await this.analyticsService.getHourlyStats(date);

    return {
      success: true,
      data: stats,
    };
  }

  @Get('daily-stats')
  async getDailyStats(
    @Query('days') days?: string
  ): Promise<{
    success: boolean;
    data: DailyStats[];
  }> {
    const stats = await this.analyticsService.getDailyStats(
      days ? parseInt(days) : 30
    );

    return {
      success: true,
      data: stats,
    };
  }

  @Post('hourly-stats')
  async recordHourlyStats(
    @Query('hour') hour: string,
    @Query('messageCount') messageCount: string,
    @Query('completedCount') completedCount: string,
    @Query('failedCount') failedCount: string,
    @Query('avgProcessingTime') avgProcessingTime: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.analyticsService.recordHourlyStats(
        parseInt(hour),
        parseInt(messageCount),
        parseInt(completedCount),
        parseInt(failedCount),
        parseFloat(avgProcessingTime)
      );

      return {
        success: true,
        message: 'Hourly stats recorded successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  // === PROCESSING TIME ANALYTICS ===

  @Get('processing-time-stats')
  async getProcessingTimeStats(): Promise<{
    success: boolean;
    data: {
      average: number;
      median: number;
      p95: number;
      p99: number;
      fastest: number;
      slowest: number;
    };
  }> {
    const stats = await this.analyticsService.getProcessingTimeStats();

    return {
      success: true,
      data: stats,
    };
  }

  // === COMPREHENSIVE METRICS ===

  @Get('activity-metrics')
  async getActivityMetrics(): Promise<{
    success: boolean;
    data: ActivityMetrics;
  }> {
    const metrics = await this.analyticsService.getActivityMetrics();

    return {
      success: true,
      data: metrics,
    };
  }

  // === DASHBOARD DATA ===

  @Get('dashboard')
  async getDashboardData(): Promise<{
    success: boolean;
    data: {
      activityMetrics: ActivityMetrics;
      processingStats: any;
      recentTrends: {
        hourlyStats: HourlyStats[];
        dailyStats: DailyStats[];
      };
      topPerformers: UserLeaderboards;
    };
  }> {
    const [activityMetrics, processingStats, hourlyStats, dailyStats, topPerformers] = await Promise.all([
      this.analyticsService.getActivityMetrics(),
      this.analyticsService.getProcessingTimeStats(),
      this.analyticsService.getHourlyStats(),
      this.analyticsService.getDailyStats(7),
      this.analyticsService.getUserLeaderboards(5),
    ]);

    return {
      success: true,
      data: {
        activityMetrics,
        processingStats,
        recentTrends: {
          hourlyStats,
          dailyStats,
        },
        topPerformers,
      },
    };
  }

  // === ADMIN OPERATIONS ===

  @Delete('cleanup')
  async cleanupOldAnalytics(
    @Query('days') days?: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.analyticsService.cleanupOldAnalytics(
        days ? parseInt(days) : 30
      );

      return {
        success: true,
        message: `Analytics data older than ${days || 30} days has been cleaned up`,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // === REAL-TIME STATS ===

  @Get('realtime-stats')
  async getRealtimeStats(): Promise<{
    success: boolean;
    data: {
      currentHour: {
        messages: number;
        completed: number;
        failed: number;
        processing: number;
      };
      last24Hours: {
        totalMessages: number;
        averageProcessingTime: number;
        successRate: number;
      };
      topActiveUsers: any[];
      recentTrendingTopics: TrendingTopic[];
    };
  }> {
    const now = new Date();
    const currentHour = now.getHours();
    const today = now.toISOString().split('T')[0];

    const [
      hourlyStats,
      activityMetrics,
      topUsers,
      trendingTopics,
      processingStats
    ] = await Promise.all([
      this.analyticsService.getHourlyStats(today),
      this.analyticsService.getActivityMetrics(),
      this.analyticsService.getLeaderboard('overallActivity', { limit: 5, timeframe: 'day' }),
      this.analyticsService.getTrendingTopics(5),
      this.analyticsService.getProcessingTimeStats()
    ]);

    const currentHourStats = hourlyStats.find(stat => stat.hour === currentHour);

    const currentStats = {
      messages: currentHourStats?.messageCount || 0,
      completed: currentHourStats?.completedCount || 0,
      failed: currentHourStats?.failedCount || 0,
      processing: 0, // Will be calculated below
    };

    currentStats.processing = Math.max(0, currentStats.messages - currentStats.completed - currentStats.failed);

    const totalFailedToday = hourlyStats.reduce((sum, stat) => sum + (stat.failedCount || 0), 0);

    const successRate = activityMetrics.messagesLast24Hours > 0 
      ? ((activityMetrics.messagesLast24Hours - totalFailedToday) / activityMetrics.messagesLast24Hours) * 100
      : 0;

    return {
      success: true,
      data: {
        currentHour: currentStats,
        last24Hours: {
          totalMessages: activityMetrics.messagesLast24Hours,
          averageProcessingTime: processingStats.average,
          successRate: Math.round(successRate * 100) / 100,
        },
        topActiveUsers: topUsers,
        recentTrendingTopics: trendingTopics,
      },
    };
  }
}