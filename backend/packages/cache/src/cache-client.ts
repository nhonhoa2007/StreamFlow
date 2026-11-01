import { Redis } from "ioredis";
import { Singleflight, calculateTtlWithJitter } from "./singleflight.js";

export interface CacheHandle {
  redis: Redis;
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, ttlSeconds?: number) => Promise<void>;
  del: (...keys: string[]) => Promise<void>;
  deleteByPattern: (pattern: string) => Promise<number>;
  getOrSetWithSingleflight: <T>(
    key: string,
    baseTtlSeconds: number,
    loader: () => Promise<T>,
  ) => Promise<T>;
  checkHealth: () => Promise<boolean>;
  close: () => Promise<void>;
}

export function createCacheClient(redisUrl: string): CacheHandle {
  const singleflight = new Singleflight();

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 1000);
    },
  });

  redis.on("error", () => {
    // Fail-open: prevent unhandled error event crash
  });

  const get = async <T>(key: string): Promise<T | null> => {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      // Fail-open: on redis error, treat as cache miss
      return null;
    }
  };

  const set = async (key: string, value: unknown, ttlSeconds = 60): Promise<void> => {
    try {
      const serialized = JSON.stringify(value);
      const jitteredTtl = calculateTtlWithJitter(ttlSeconds);
      await redis.setex(key, jitteredTtl, serialized);
    } catch {
      // Fail-open: ignore cache set errors
    }
  };

  const del = async (...keys: string[]): Promise<void> => {
    if (keys.length === 0) return;
    try {
      await redis.del(...keys);
    } catch {
      // Fail-open
    }
  };

  const deleteByPattern = async (pattern: string): Promise<number> => {
    try {
      const stream = redis.scanStream({
        match: pattern,
        count: 100,
      });

      let totalDeleted = 0;
      for await (const batch of stream) {
        const keys = batch as string[];
        if (keys.length > 0) {
          await redis.del(...keys);
          totalDeleted += keys.length;
        }
      }
      return totalDeleted;
    } catch {
      return 0;
    }
  };

  const getOrSetWithSingleflight = async <T>(
    key: string,
    baseTtlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> => {
    // 1. Try cache read
    const cached = await get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    // 2. Coalesce concurrent cache misses via Singleflight
    return singleflight.run(key, async () => {
      // Double check after acquiring flight lock in case another promise populated it
      const secondCheck = await get<T>(key);
      if (secondCheck !== null && secondCheck !== undefined) {
        return secondCheck;
      }

      // Execute underlying loader (e.g. database query)
      const freshData = await loader();

      // Write back to cache (asynchronous fail-open)
      if (freshData !== null && freshData !== undefined) {
        await set(key, freshData, baseTtlSeconds);
      }

      return freshData;
    });
  };

  const checkHealth = async (): Promise<boolean> => {
    try {
      const ping = await redis.ping();
      return ping === "PONG";
    } catch {
      return false;
    }
  };

  const close = async (): Promise<void> => {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  };

  return {
    redis,
    get,
    set,
    del,
    deleteByPattern,
    getOrSetWithSingleflight,
    checkHealth,
    close,
  };
}
