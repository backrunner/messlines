/**
 * In-memory session storage for local development
 *
 * This module provides a simple in-memory replacement for Durable Objects
 * when running in local dev mode. Since local dev doesn't have access to
 * Durable Objects, we store session metadata in a Map instead.
 *
 * Features:
 * - In-memory Map storage for session metadata
 * - Automatic session expiration (2 hours)
 * - Same interface as Durable Object session storage
 *
 * NOTE: This is ONLY for local development. In production, use Durable Objects.
 */

interface SessionMetadata {
  doId: string;
  sessionId: string;
  audioKeys: string[];
  createdAt: number;
}

class DevSessionStorage {
  private sessions: Map<string, SessionMetadata> = new Map();
  private readonly SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

  /**
   * Create a new session in memory
   */
  createSession(doId: string, sessionId: string, audioKeys: string[]): void {
    const metadata: SessionMetadata = {
      doId,
      sessionId,
      audioKeys,
      createdAt: Date.now(),
    };

    this.sessions.set(doId, metadata);
    console.log(`💾 [DEV] Created session in memory: ${doId} (internal: ${sessionId})`);

    // Schedule cleanup
    setTimeout(() => {
      this.sessions.delete(doId);
      console.log(`🧹 [DEV] Auto-expired session: ${doId}`);
    }, this.SESSION_TIMEOUT_MS);
  }

  /**
   * Get session metadata from memory
   */
  getSessionMetadata(doId: string): SessionMetadata {
    const metadata = this.sessions.get(doId);

    if (!metadata) {
      throw new Error('Session not found or expired');
    }

    // Check expiration
    const now = Date.now();
    if (now - metadata.createdAt > this.SESSION_TIMEOUT_MS) {
      this.sessions.delete(doId);
      throw new Error('Session expired');
    }

    console.log(`✅ [DEV] Retrieved session metadata from memory: ${doId}`);
    return metadata;
  }

  /**
   * Check if session exists and is valid
   */
  validateSession(doId: string): boolean {
    const metadata = this.sessions.get(doId);

    if (!metadata) {
      return false;
    }

    // Check expiration
    const now = Date.now();
    if (now - metadata.createdAt > this.SESSION_TIMEOUT_MS) {
      this.sessions.delete(doId);
      return false;
    }

    return true;
  }

  /**
   * Delete a session
   */
  deleteSession(doId: string): void {
    this.sessions.delete(doId);
    console.log(`🗑️ [DEV] Deleted session from memory: ${doId}`);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
    };
  }

  /**
   * Manual cleanup of expired sessions
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [doId, metadata] of this.sessions.entries()) {
      if (now - metadata.createdAt > this.SESSION_TIMEOUT_MS) {
        this.sessions.delete(doId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 [DEV] Cleaned up ${cleanedCount} expired sessions`);
    }
  }
}

// Global instance for dev mode
export const devSessionStorage = new DevSessionStorage();

// Periodic cleanup (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    devSessionStorage.cleanup();
  }, 5 * 60 * 1000);
}
