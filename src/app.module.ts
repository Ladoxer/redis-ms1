import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { MessageModule } from './message/message.module';

@Module({
  imports: [RedisModule, MessageModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}