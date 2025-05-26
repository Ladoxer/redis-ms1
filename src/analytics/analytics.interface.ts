export interface LeaderboardEntry {
  userId: string;
  username: string;
  score: number;
  rank: number;
}

export interface UserLeaderboards {
  messagesSent: LeaderboardEntry[];
  messagesCompleted: LeaderboardEntry[];
  processingSpeed: LeaderboardEntry[];
  overallActivity: LeaderboardEntry[];
}

export interface TrendingTopic {
  topic: string;
  frequency: number;
  rank: number;
  lastSeen: string;
}

export interface MessageFrequency {
  messageId: string;
  content: string;
  frequency: number;
  rank: number;
  priority: string;
  lastOccurrence: string;
}

export interface ActivityMetrics {
  totalMessages: number;
  messagesLast24Hours: number;
  messagesLast7Days: number;
  peakHour: number;
  peakDay: string;
  averageMessagesPerHour: number;
  topUsers: LeaderboardEntry[];
  trendingTopics: TrendingTopic[];
}

export interface TimeSeriesData {
  timestamp: string;
  value: number;
  label?: string;
}

export interface HourlyStats {
  hour: number;
  messageCount: number;
  completedCount: number;
  failedCount: number;
  averageProcessingTime: number;
}

export interface DailyStats {
  date: string;
  messageCount: number;
  completedCount: number;
  failedCount: number;
  activeUsers: number;
  averageProcessingTime: number;
}

export interface UserActivityScore {
  userId: string;
  username: string;
  messagesSent: number;
  messagesCompleted: number;
  successRate: number;
  averageProcessingTime: number;
  lastActive: string;
  activityScore: number;
  rank: number;
}

export interface LeaderboardFilters {
  timeframe?: 'day' | 'week' | 'month' | 'all';
  category?: 'messages' | 'completion' | 'speed' | 'activity';
  limit?: number;
  minScore?: number;
}

export interface MessageAnalytics {
  totalMessages: number;
  completedMessages: number;
  failedMessages: number;
  averageProcessingTime: number;
  messagesByPriority: Record<string, number>;
  messagesByStatus: Record<string, number>;
  hourlyDistribution: HourlyStats[];
  dailyTrends: DailyStats[];
  topWords: Array<{word: string, count: number}>;
  contentLengthStats: {
    average: number;
    median: number;
    shortest: number;
    longest: number;
  };
}