/**
 * High-performance client-side in-memory database cache with TTL and mutation invalidation.
 * Drastically reduces repeated Supabase read calls, saves bandwidth (staying well within the 500 MB limit),
 * and prevents hitting API limits on free Supabase tiers.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // in milliseconds
}

export const CACHE_TTL = {
  PRODUCTS: 5 * 60 * 1000,        // 5 minutes
  RECIPES: 5 * 60 * 1000,         // 5 minutes
  PACKET_TYPES: 10 * 60 * 1000,   // 10 minutes
  INGREDIENTS: 60 * 1000,         // 1 minute (stock updates quickly)
  PRODUCTION_RUNS: 45 * 1000,     // 45 seconds
  DAILY_CLOSINGS: 2 * 60 * 1000,  // 2 minutes
  DAILY_WAGES: 3 * 60 * 1000,     // 3 minutes
  SELLING_PRICES: 5 * 60 * 1000,  // 5 minutes
  PACKING_RECORDS: 60 * 1000,     // 1 minute
  STOCK_MOVEMENTS: 45 * 1000,     // 45 seconds
  AUDIT_LOGS: 2 * 60 * 1000,      // 2 minutes
  SETTINGS: 10 * 60 * 1000,       // 10 minutes
  METRICS: 60 * 1000,             // 1 minute
};

class DatabaseCache {
  private cache = new Map<string, CacheEntry<any>>();

  // Expose TTL both as static and instance property to avoid undefined property access
  public static readonly TTL = CACHE_TTL;
  public readonly TTL = CACHE_TTL;

  /**
   * Retrieves an item from cache if present and not expired.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Stores an item in cache with a TTL.
   */
  set<T>(key: string, data: T, ttl: number = DatabaseCache.TTL.PRODUCTS): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Wraps an async query fetcher with caching logic.
   * If cached and not expired, returns cached value immediately.
   * If force is true, bypasses cache and updates with fresh data.
   */
  async wrap<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: { ttl?: number; force?: boolean }
  ): Promise<T> {
    if (!options?.force) {
      const cached = this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    }

    const data = await fetcher();
    this.set<T>(key, data, options?.ttl);
    return data;
  }

  /**
   * Invalidate specific keys or keys matching a prefix/regex pattern.
   */
  invalidate(patternOrKey: string): void {
    for (const key of this.cache.keys()) {
      if (key === patternOrKey || key.startsWith(patternOrKey) || key.includes(patternOrKey)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears the entire database cache (e.g., when user triggers manual refresh).
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get total number of cached entries.
   */
  size(): number {
    return this.cache.size;
  }
}

export const dbCache = new DatabaseCache();
