import { createClient, type RedisClientType } from 'redis';
import type { Logger } from '../lib/logger.js';

export class RedisCache {
  private client: RedisClientType | null = null;
  private readonly log: Logger;
  private readonly url: string | null;

  constructor(url: string | null, log: Logger) {
    this.url = url;
    this.log = log;
  }

  async connect(): Promise<void> {
    if (!this.url) {
      this.log.debug('redis-disabled-no-url');
      return;
    }
    try {
      this.client = createClient({ url: this.url });
      this.client.on('error', (err) => {
        this.log.error('redis-error', { error: err });
      });
      await this.client.connect();
      this.log.info('redis-connected');
    } catch (err) {
      this.log.warn('redis-connect-failed', { error: err });
      this.client = null; // graceful fallback to no-op
    }
  }

  /**
   * Check if a key is rate-limited using a sliding window or TTL bucket.
   * Returns true if request is allowed, false if limit exceeded.
   */
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!this.client) return true; // Fail open if Redis is unavailable
    try {
      const current = await this.client.incr(key);
      if (current === 1) {
        await this.client.expire(key, windowSeconds);
      }
      return current <= limit;
    } catch (err) {
      this.log.warn('redis-ratelimit-error', { key, error: err });
      return true;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      this.log.warn('redis-get-error', { key, error: err });
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, { EX: ttlSeconds });
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.log.warn('redis-set-error', { key, error: err });
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.log.info('redis-closed');
    }
  }
}
