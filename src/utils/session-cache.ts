/**
 * Worker-level in-memory cache for session metadata
 * Reduces Durable Object costs by checking worker memory before accessing DOs
 *
 * Architecture:
 * - Cache is stored in worker memory (ephemeral)
 * - Each worker instance has its own cache
 * - Cache entries expire to match DO session timeout
 * - Falls back to DO if cache miss or expired
 *
 * Benefits:
 * - Reduces DO requests for frequently accessed sessions
 * - Minimizes DO activation costs
 * - Decreases latency for cached sessions
 */

interface CachedSessionMetadata {
  doId: string;
  sessionId: string;
  audioKeys: string[];
  createdAt: number;
  cachedAt: number;
  isDeleted?: boolean; // Soft-delete marker for invalidated sessions
  version?: number; // Version for cache invalidation
}

interface CacheEntry {
  data: CachedSessionMetadata;
  expiresAt: number;
}

class SessionCache {
  private cache = new Map<string, CacheEntry>();

  // Match DO session timeout (2 hours)
  private readonly CACHE_TTL_MS = 2 * 60 * 60 * 1000;

  // Limit cache size to prevent memory issues (LRU eviction)
  private readonly MAX_CACHE_SIZE = 100;

  /**
   * Store session metadata in worker memory
   */
  set(sessionId: string, metadata: CachedSessionMetadata): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        console.log(`🗑️ Worker cache: Evicted oldest entry ${firstKey} (LRU)`);
      }
    }

    const expiresAt = Date.now() + this.CACHE_TTL_MS;
    this.cache.set(sessionId, {
      data: metadata,
      expiresAt,
    });

    console.log(`💾 Worker cache: Stored session ${sessionId} (expires in ${this.CACHE_TTL_MS / 1000 / 60} min)`);
  }

  /**
   * Retrieve session metadata from worker memory
   * Returns null if not found, expired, or soft-deleted
   */
  get(sessionId: string): CachedSessionMetadata | null {
    const entry = this.cache.get(sessionId);

    if (!entry) {
      console.log(`❌ Worker cache: MISS for session ${sessionId}`);
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(sessionId);
      console.log(`⏰ Worker cache: EXPIRED for session ${sessionId}`);
      return null;
    }

    // Check if soft-deleted (invalidated but not yet evicted)
    if (entry.data.isDeleted) {
      console.log(`🗑️ Worker cache: DELETED for session ${sessionId}`);
      return null;
    }

    console.log(`✅ Worker cache: HIT for session ${sessionId}`);
    return entry.data;
  }

  /**
   * Check if session exists in cache (without retrieving)
   */
  has(sessionId: string): boolean {
    const entry = this.cache.get(sessionId);
    if (!entry) return false;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Remove session from cache
   */
  delete(sessionId: string): void {
    this.cache.delete(sessionId);
    console.log(`🗑️ Worker cache: Deleted session ${sessionId}`);
  }

  /**
   * Mark session as deleted (soft delete) without removing from cache
   * This allows other workers to know the session is invalid
   */
  markDeleted(sessionId: string): void {
    const entry = this.cache.get(sessionId);
    if (entry) {
      entry.data.isDeleted = true;
      console.log(`🗑️ Worker cache: Marked session ${sessionId} as deleted`);
    }
  }

  /**
   * Check if session is marked as deleted
   */
  isDeleted(sessionId: string): boolean {
    const entry = this.cache.get(sessionId);
    return entry?.data.isDeleted ?? false;
  }

  /**
   * Clear all cached sessions
   */
  clear(): void {
    this.cache.clear();
    console.log(`🧹 Worker cache: Cleared all sessions`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let validCount = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
      maxSize: this.MAX_CACHE_SIZE,
      utilizationPercent: (this.cache.size / this.MAX_CACHE_SIZE) * 100,
    };
  }

  /**
   * Clean up expired entries
   * Call periodically to free memory
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Worker cache: Cleaned up ${cleanedCount} expired entries`);
    }
  }
}

// Global cache instance (shared across requests in same worker)
// Note: Each worker instance has its own cache
export const sessionCache = new SessionCache();
