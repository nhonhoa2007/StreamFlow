import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { type CacheHandle, createCacheClient } from "@streamflow/cache";
import { API_CONFIG_TOKEN } from "../constants.js";

export interface CacheModuleConfig {
  REDIS_URL?: string;
  CACHE_TTL_SECONDS?: number;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly client: CacheHandle;
  readonly defaultTtl: number;

  constructor(
    @Inject(API_CONFIG_TOKEN)
    private readonly config: CacheModuleConfig,
  ) {
    const redisUrl = this.config.REDIS_URL || "redis://127.0.0.1:6379";
    this.defaultTtl = this.config.CACHE_TTL_SECONDS ?? 60;
    this.client = createCacheClient(redisUrl);
  }

  async getOrSetWithSingleflight<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    return this.client.getOrSetWithSingleflight(key, ttlSeconds, loader);
  }

  async del(...keys: string[]): Promise<void> {
    return this.client.del(...keys);
  }

  async deleteByPattern(pattern: string): Promise<number> {
    return this.client.deleteByPattern(pattern);
  }

  async checkHealth(): Promise<boolean> {
    return this.client.checkHealth();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
