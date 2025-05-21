import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;

  // eslint-disable-next-line @typescript-eslint/require-await
  async onModuleInit() {
    this.redisClient = new Redis({
      host: 'localhost',
      port: 6379,
    });
    
    this.redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
    
    this.redisClient.on('connect', () => {
      console.log('Connected to Redis server');
    });
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }

  // Basic String operations
  async set(key: string, value: string): Promise<void> {
    await this.redisClient.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return await this.redisClient.get(key);
  }
  
  // List operations
  async lpush(key: string, value: string | string[]): Promise<number> {
    if (Array.isArray(value)) {
      return await this.redisClient.lpush(key, ...value);
    }
    return await this.redisClient.lpush(key, value);
  }
  
  async rpop(key: string): Promise<string | null> {
    return await this.redisClient.rpop(key);
  }
  
  async lrange(key: string, start = 0, end = -1): Promise<string[]> {
    return await this.redisClient.lrange(key, start, end);
  }
  
  async llen(key: string): Promise<number> {
    return await this.redisClient.llen(key);
  }
}