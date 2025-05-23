export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended'
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
  profilePicture?: string;
  bio?: string;
}

export interface UserPreferences {
  userId: string;
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  messageSettings: {
    defaultPriority: string;
    autoRetry: boolean;
    maxRetries: number;
  };
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  privacy: {
    profileVisible: boolean;
    showEmail: boolean;
    showLastSeen: boolean;
  };
}

export interface UserStats {
  userId: string;
  totalMessagesSent: number;
  totalMessagesProcessed: number;
  totalCompletedMessages: number;
  totalFailedMessages: number;
  averageProcessingTime: number;
  lastActivityAt: string;
  loginCount: number;
}

export interface CreateUserDto {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  bio?: string;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  bio?: string;
  profilePicture?: string;
}

export interface UserWithStats {
  profile: UserProfile;
  preferences: UserPreferences;
  stats: UserStats;
}