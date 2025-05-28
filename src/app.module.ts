import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { MessageModule } from './message/message.module';
import { UserModule } from './user/user.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationModule } from './notification/notification.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [RedisModule, MessageModule, UserModule, AnalyticsModule, NotificationModule, ChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
