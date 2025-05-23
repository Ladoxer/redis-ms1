import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { RedisModule } from '../redis/redis.module';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [RedisModule, MessageModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}