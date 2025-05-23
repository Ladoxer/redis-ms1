import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service';
import { MessageService } from '../message/message.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UserProfile,
  UserPreferences,
  UserStats,
  UserWithStats,
} from './user.interface';

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

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly messageService: MessageService
  ) {}

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto): Promise<{
    success: boolean;
    message: string;
    data: UserProfile;
  }> {
    try {
      const user = await this.userService.createUser(createUserDto);
      return {
        success: true,
        message: 'User created successfully',
        data: user,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get(':userId')
  async getUserById(@Param('userId') userId: string): Promise<{
    success: boolean;
    data: UserProfile;
  }> {
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data: user,
    };
  }

  @Get('username/:username')
  async getUserByUsername(@Param('username') username: string): Promise<{
    success: boolean;
    data: UserProfile;
  }> {
    const user = await this.userService.getUserByUsername(username);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data: user,
    };
  }

  @Get('email/:email')
  async getUserByEmail(@Param('email') email: string): Promise<{
    success: boolean;
    data: UserProfile;
  }> {
    const user = await this.userService.getUserByEmail(email);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data: user,
    };
  }

  @Put(':userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto
  ): Promise<{
    success: boolean;
    message: string;
    data: UserProfile;
  }> {
    try {
      const user = await this.userService.updateUser(userId, updateUserDto);
      return {
        success: true,
        message: 'User updated successfully',
        data: user!,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.NOT_FOUND);
    }
  }

  @Get(':userId/preferences')
  async getUserPreferences(@Param('userId') userId: string): Promise<{
    success: boolean;
    data: UserPreferences;
  }> {
    const preferences = await this.userService.getUserPreferences(userId);
    if (!preferences) {
      throw new HttpException('User preferences not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data: preferences,
    };
  }

  @Put(':userId/preferences')
  async updateUserPreferences(
    @Param('userId') userId: string,
    @Body() preferences: Partial<UserPreferences>
  ): Promise<{
    success: boolean;
    message: string;
    data: UserPreferences;
  }> {
    try {
      const updatedPreferences = await this.userService.updateUserPreferences(
        userId,
        preferences
      );
      return {
        success: true,
        message: 'Preferences updated successfully',
        data: updatedPreferences!,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.NOT_FOUND);
    }
  }

  @Get(':userId/stats')
  async getUserStats(@Param('userId') userId: string): Promise<{
    success: boolean;
    data: UserStats;
  }> {
    const stats = await this.userService.getUserStats(userId);
    if (!stats) {
      throw new HttpException('User stats not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data: stats,
    };
  }

  @Get(':userId/complete')
  async getUserWithStats(@Param('userId') userId: string): Promise<{
    success: boolean;
    data: UserWithStats;
  }> {
    const userWithStats = await this.userService.getUserWithStats(userId);
    if (!userWithStats) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data: userWithStats,
    };
  }

  @Post(':userId/login')
  async recordLogin(@Param('userId') userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.userService.recordUserLogin(userId);
      return {
        success: true,
        message: 'Login recorded successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get(':userId/messages')
  async getUserMessages(@Param('userId') userId: string): Promise<{
    success: boolean;
    data: {
      messages: any[];
      stats: any;
    };
  }> {
    const [messages, messageStats] = await Promise.all([
      this.messageService.getMessagesByUser(userId),
      this.messageService.getUserMessageStats(userId),
    ]);

    return {
      success: true,
      data: {
        messages,
        stats: messageStats,
      },
    };
  }

  @Get()
  async getAllActiveUsers(): Promise<{
    success: boolean;
    count: number;
    data: UserProfile[];
  }> {
    const users = await this.userService.getAllActiveUsers();
    return {
      success: true,
      count: users.length,
      data: users,
    };
  }

  @Put(':userId/deactivate')
  async deactivateUser(@Param('userId') userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.userService.deactivateUser(userId);
      return {
        success: true,
        message: 'User deactivated successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':userId')
  async deleteUser(@Param('userId') userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.userService.deleteUser(userId);
      return {
        success: true,
        message: 'User deleted successfully',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.NOT_FOUND);
    }
  }
}