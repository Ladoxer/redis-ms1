import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  // eslint-disable-next-line @typescript-eslint/require-await
  async onModuleInit() {
    this.redisClient = new Redis({
      host: 'localhost',
      port: 6379,
    });
    
    this.redisClient.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
    
    this.redisClient.on('connect', () => {
      this.logger.log('Connected to Redis server');
    });
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }

  // Basic String operations
  async set(key: string, value: string, ttl?: number): Promise<string | null> {
    if (ttl) {
      return await this.redisClient.setex(key, ttl, value);
    }
    return await this.redisClient.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return await this.redisClient.get(key);
  }

  async del(key: string): Promise<number> {
    return await this.redisClient.del(key);
  }

  // === ENHANCED LIST OPERATIONS ===
  
  // Add to head of list
  async lpush(key: string, value: string | string[]): Promise<number> {
    if (Array.isArray(value)) {
      return await this.redisClient.lpush(key, ...value);
    }
    return await this.redisClient.lpush(key, value);
  }

  // Add to tail of list
  async rpush(key: string, value: string | string[]): Promise<number> {
    if (Array.isArray(value)) {
      return await this.redisClient.rpush(key, ...value);
    }
    return await this.redisClient.rpush(key, value);
  }

  // Remove from head of list
  async lpop(key: string): Promise<string | null> {
    return await this.redisClient.lpop(key);
  }

  // Remove from tail of list
  async rpop(key: string): Promise<string | null> {
    return await this.redisClient.rpop(key);
  }

  // Get list length
  async llen(key: string): Promise<number> {
    return await this.redisClient.llen(key);
  }

  // Get range of elements from list
  async lrange(key: string, start = 0, end = -1): Promise<string[]> {
    return await this.redisClient.lrange(key, start, end);
  }

  // Get element at specific index
  async lindex(key: string, index: number): Promise<string | null> {
    return await this.redisClient.lindex(key, index);
  }

  // Remove elements from list
  async lrem(key: string, count: number, element: string): Promise<number> {
    return await this.redisClient.lrem(key, count, element);
  }

  // Blocking pop (useful for worker processes)
  async blpop(key: string, timeout: number): Promise<[string, string] | null> {
    return await this.redisClient.blpop(key, timeout);
  }

  async brpop(key: string, timeout: number): Promise<[string, string] | null> {
    return await this.redisClient.brpop(key, timeout);
  }

  // === SET OPERATIONS ===

  // Add member to set
  async sadd(key: string, member: string | string[]): Promise<number> {
    if (Array.isArray(member)) {
      return await this.redisClient.sadd(key, ...member);
    }
    return await this.redisClient.sadd(key, member);
  }

  // Check if member exists in set
  async sismember(key: string, member: string): Promise<number> {
    return await this.redisClient.sismember(key, member);
  }

  // Get all members of set
  async smembers(key: string): Promise<string[]> {
    return await this.redisClient.smembers(key);
  }

  // Get set size
  async scard(key: string): Promise<number> {
    return await this.redisClient.scard(key);
  }

  // Remove member from set
  async srem(key: string, member: string | string[]): Promise<number> {
    if (Array.isArray(member)) {
      return await this.redisClient.srem(key, ...member);
    }
    return await this.redisClient.srem(key, member);
  }

  // Get random member from set
  async srandmember(key: string, count?: number): Promise<string | string[] | null> {
    if (count) {
      return await this.redisClient.srandmember(key, count);
    }
    return await this.redisClient.srandmember(key);
  }

  // Pop random member from set
  async spop(key: string, count?: number): Promise<string | string[] | null> {
    if (count) {
      return await this.redisClient.spop(key, count);
    }
    return await this.redisClient.spop(key);
  }

  // Set operations
  async sunion(keys: string[]): Promise<string[]> {
    return await this.redisClient.sunion(...keys);
  }

  async sinter(keys: string[]): Promise<string[]> {
    return await this.redisClient.sinter(...keys);
  }

  async sdiff(keys: string[]): Promise<string[]> {
    return await this.redisClient.sdiff(...keys);
  }

  // === UTILITY OPERATIONS ===
  
  // Check if key exists
  async exists(key: string): Promise<number> {
    return await this.redisClient.exists(key);
  }

  // Set expiration on key
  async expire(key: string, seconds: number): Promise<number> {
    return await this.redisClient.expire(key, seconds);
  }

  // Get time to live
  async ttl(key: string): Promise<number> {
    return await this.redisClient.ttl(key);
  }

  // === HASH OPERATIONS ===

  // Set field in hash
  async hset(key: string, field: string, value: string): Promise<number> {
    return await this.redisClient.hset(key, field, value);
  }

  // Set multiple fields in hash
  async hmset(key: string, fieldValues: Record<string, string>): Promise<string> {
    const args: string[] = [];
    for (const [field, value] of Object.entries(fieldValues)) {
      args.push(field, value);
    }
    return await this.redisClient.hmset(key, ...args);
  }

  // Get field from hash
  async hget(key: string, field: string): Promise<string | null> {
    return await this.redisClient.hget(key, field);
  }

  // Get multiple fields from hash
  async hmget(key: string, fields: string[]): Promise<(string | null)[]> {
    return await this.redisClient.hmget(key, ...fields);
  }

  // Get all fields and values from hash
  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.redisClient.hgetall(key);
  }

  // Check if field exists in hash
  async hexists(key: string, field: string): Promise<number> {
    return await this.redisClient.hexists(key, field);
  }

  // Delete field from hash
  async hdel(key: string, field: string | string[]): Promise<number> {
    if (Array.isArray(field)) {
      return await this.redisClient.hdel(key, ...field);
    }
    return await this.redisClient.hdel(key, field);
  }

  // Get all field names from hash
  async hkeys(key: string): Promise<string[]> {
    return await this.redisClient.hkeys(key);
  }

  // Get all values from hash
  async hvals(key: string): Promise<string[]> {
    return await this.redisClient.hvals(key);
  }

  // Get number of fields in hash
  async hlen(key: string): Promise<number> {
    return await this.redisClient.hlen(key);
  }

  // Increment field value in hash
  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return await this.redisClient.hincrby(key, field, increment);
  }

  // Increment field value by float in hash
  async hincrbyfloat(key: string, field: string, increment: number): Promise<string> {
    return await this.redisClient.hincrbyfloat(key, field, increment);
  }

  // Set field only if it doesn't exist
  async hsetnx(key: string, field: string, value: string): Promise<number> {
    return await this.redisClient.hsetnx(key, field, value);
  }

  // Scan hash fields (for large hashes)
  async hscan(key: string, cursor: number, pattern?: string, count?: number): Promise<[string, string[]]> {
    if (pattern && count) {
      return await this.redisClient.hscan(key, cursor, 'MATCH', pattern, 'COUNT', count);
    } else if (pattern) {
      return await this.redisClient.hscan(key, cursor, 'MATCH', pattern);
    } else if (count) {
      return await this.redisClient.hscan(key, cursor, 'COUNT', count);
    } else {
      return await this.redisClient.hscan(key, cursor);
    }
  }
}