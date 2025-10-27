import { DurableObject } from 'cloudflare:workers';

/**
 * Custom error for expired sessions
 * Client should catch this and create a new session
 */
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/**
 * Lightweight Durable Object for session metadata storage ONLY
 *
 * NEW ARCHITECTURE (optimized for cost and performance):
 * - DO: Stores ONLY session metadata (~1KB): sessionId, audioKeys, createdAt
 * - Worker: Handles ALL audio processing using WorkerSessionManager
 * - Audio data: Never stored in DO, fetched from R2 by worker on-demand
 *
 * Benefits:
 * - Zero DO data transfer (only metadata queries)
 * - Wall-clock time: 5000ms → <10ms
 * - DO costs reduced by >95%
 * - Worker processes audio locally (no DO bottleneck)
 *
 * Lifecycle:
 * - Sessions expire after 2 hours from creation (absolute timeout)
 * - Automatic cleanup via alarms
 * - Zero storage writes during playback
 */
export class SecStreamSession extends DurableObject {
  // Session metadata (lightweight, persisted to DO storage)
  private sessionData: {
    doId: string | null;  // Durable Object ID (for routing)
    sessionId: string | null;  // Session ID (for secstream)
    audioKeys: string[];  // R2 keys for audio files
    createdAt: number;
  } = {
    doId: null,
    sessionId: null,
    audioKeys: [],
    createdAt: 0,
  };

  // Session expires after 2 hours from creation (absolute timeout)
  private readonly SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize from storage
    this.ctx.blockConcurrencyWhile(async () => {
      // Load session data from storage if it exists
      const stored = await this.ctx.storage.get<typeof this.sessionData>('sessionData');
      if (stored) {
        this.sessionData = stored;
        console.log(`📂 Loaded session metadata from storage: DO ${stored.doId}`);

        // Check if session has expired
        const now = Date.now();
        const age = now - stored.createdAt;
        if (age >= this.SESSION_TIMEOUT_MS) {
          console.log(`⏰ Session expired (age: ${(age / 1000 / 60).toFixed(1)} min), cleaning up...`);
          await this.destroySession();
          return;
        }

        // Session is valid, ensure alarm is set for expiration
        const expirationTime = stored.createdAt + this.SESSION_TIMEOUT_MS;
        const alarmTime = await this.ctx.storage.getAlarm();
        if (alarmTime === null || Math.abs(alarmTime - expirationTime) > 1000) {
          await this.ctx.storage.setAlarm(expirationTime);
          console.log(`⏰ Set alarm for ${new Date(expirationTime).toISOString()}`);
        }
      }
    });
  }

  /**
   * Initialize cleanup alarm
   */
  private async initializeAlarm() {
    const now = Date.now();
    const expirationTime = now + this.SESSION_TIMEOUT_MS;
    await this.ctx.storage.setAlarm(expirationTime);
    console.log(`⏰ Alarm set for ${new Date(expirationTime).toISOString()}`);
  }

  /**
   * Alarm handler - cleanup expired session
   */
  async alarm() {
    const now = Date.now();
    const age = this.sessionData.createdAt ? now - this.sessionData.createdAt : 0;
    console.log(`⏰ Alarm triggered for DO ${this.sessionData.doId} (age: ${(age / 1000 / 60).toFixed(1)} min), cleaning up...`);
    await this.destroySession();
  }

  /**
   * Destroy session and clean up storage
   */
  private async destroySession() {
    this.sessionData = {
      doId: null,
      sessionId: null,
      audioKeys: [],
      createdAt: 0,
    };

    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();

    console.log(`✅ Session destroyed, storage cleared`);
  }

  /**
   * Check if session has expired
   */
  private isSessionExpired(): boolean {
    if (!this.sessionData.createdAt) {
      return true;
    }
    const now = Date.now();
    const age = now - this.sessionData.createdAt;
    return age >= this.SESSION_TIMEOUT_MS;
  }

  /**
   * Throw error if session is expired
   */
  private checkSessionExpired(doId: string): void {
    if (this.isSessionExpired()) {
      throw new SessionExpiredError(`Session ${doId} has expired. Please create a new session.`);
    }
  }

  /**
   * Create a new session (stores metadata only)
   * @param doId - Durable Object ID
   * @param sessionId - Session ID for secstream
   * @param audioKeys - R2 object keys for audio files
   */
  async createSession(doId: string, sessionId: string, audioKeys: string[]): Promise<void> {
    const now = Date.now();

    this.sessionData = {
      doId,
      sessionId,
      audioKeys,
      createdAt: now,
    };

    // Persist metadata to storage
    await this.ctx.storage.put('sessionData', this.sessionData);
    await this.initializeAlarm();

    console.log(`✅ Created session metadata in DO ${doId}`);
    console.log(`📝 Session: ${sessionId}, Audio keys: ${audioKeys.join(', ')}`);
    console.log(`💾 Storage size: ~${JSON.stringify(this.sessionData).length} bytes`);
  }

  /**
   * Get session metadata
   * This is the ONLY data worker needs from DO (lightweight query)
   */
  async getSessionMetadata(doId: string): Promise<{
    sessionId: string;
    audioKeys: string[];
    createdAt: number;
  }> {
    // Check if session has expired
    this.checkSessionExpired(doId);

    // Verify DO ID matches
    if (this.sessionData.doId !== doId) {
      throw new Error(`Session ${doId} not found in this Durable Object`);
    }

    console.log(`📋 Retrieved metadata for session ${doId} (~${JSON.stringify(this.sessionData).length} bytes)`);

    return {
      sessionId: this.sessionData.sessionId!,
      audioKeys: this.sessionData.audioKeys,
      createdAt: this.sessionData.createdAt,
    };
  }

  /**
   * Check if session exists and is valid
   */
  async validateSession(doId: string): Promise<boolean> {
    try {
      this.checkSessionExpired(doId);
      return this.sessionData.doId === doId;
    } catch {
      return false;
    }
  }
}
