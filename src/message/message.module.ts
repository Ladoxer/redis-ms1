import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { RedisModule } from '../redis/redis.module';
import { UserService } from 'src/user/user.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { NotificationService } from 'src/notification/notification.service';

@Module({
  imports: [RedisModule],
  controllers: [MessageController],
  providers: [MessageService, UserService, AnalyticsService, NotificationService],
  exports: [MessageService],
})
export class MessageModule {}