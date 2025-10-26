import { DurableObject } from 'cloudflare:workers';
import { SessionManager } from 'secstream/server';
import { SECSTREAM_CONFIG } from '../constants/playlist';
import type { ProcessorKeyExchangeRequest, ProcessorKeyExchangeResponse } from 'secstream/server';

/**
 * Durable Object for persisting secstream session state
 * Each session gets its own DO instance that persists across worker invocations
 *
 * Lifecycle:
 * - Sessions expire after 2 hours of inactivity
 * - Automatic cleanup via alarms
 * - Storage is deleted to avoid billing
 */
export class SecStreamSession extends DurableObject {
  private sessionManager: SessionManager | null = null;
  private sessionData: {
    doId: string | null;  // The Durable Object ID (used for routing)
    sessionId: string | null;  // The internal SessionManager ID (for secstream calls)
    audioKeys: string[];
    createdAt: number;
    lastAccessedAt: number;
  } = {
    doId: null,
    sessionId: null,
    audioKeys: [],
    createdAt: 0,
    lastAccessedAt: 0,
  };

  // Session expires after 2 hours of inactivity
  private readonly SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
  // Check for cleanup every 30 minutes
  private readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Initialize from storage and set up alarm
    // blockConcurrencyWhile ensures this completes before handling any requests
    this.ctx.blockConcurrencyWhile(async () => {
      // Load session data from storage if it exists
      const stored = await this.ctx.storage.get<typeof this.sessionData>('sessionData');
      if (stored) {
        this.sessionData = stored;
        console.log(`📂 Loaded session data from storage: DO ${stored.doId}`);
      }

      // Set up cleanup alarm if not already set
      await this.initializeAlarm();
    });
  }

  /**
   * Initialize the session manager if not already initialized
   */
  private ensureSessionManager() {
    if (!this.sessionManager) {
      this.sessionManager = new SessionManager({
        sliceDurationMs: SECSTREAM_CONFIG.sliceDurationMs,
        compressionLevel: SECSTREAM_CONFIG.compressionLevel,
        prewarmSlices: SECSTREAM_CONFIG.prewarmSlices,
        prewarmConcurrency: SECSTREAM_CONFIG.prewarmConcurrency,
        serverCacheSize: SECSTREAM_CONFIG.serverCacheSize,
        serverCacheTtlMs: SECSTREAM_CONFIG.serverCacheTtlMs,
      });
    }
    return this.sessionManager;
  }

  /**
   * Initialize cleanup alarm
   */
  private async initializeAlarm() {
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (!currentAlarm) {
      // Schedule first cleanup check
      await this.ctx.storage.setAlarm(Date.now() + this.CLEANUP_INTERVAL_MS);
      console.log(`⏰ Alarm set for cleanup check in ${this.CLEANUP_INTERVAL_MS / 1000 / 60} minutes`);
    }
  }

  /**
   * Alarm handler - called periodically to check for session expiry
   * Implements automatic cleanup of idle sessions
   */
  async alarm() {
    // Use in-memory session data (already loaded in constructor)
    const now = Date.now();
    const idleTime = now - this.sessionData.lastAccessedAt;

    console.log(`⏰ Alarm triggered for DO ${this.sessionData.doId}, idle for ${idleTime / 1000 / 60} minutes`);

    // Check if session has expired
    if (idleTime > this.SESSION_TIMEOUT_MS) {
      console.log(`🗑️ DO ${this.sessionData.doId} expired, cleaning up...`);
      await this.destroySession();
    } else {
      // Session still active, schedule next check
      await this.ctx.storage.setAlarm(now + this.CLEANUP_INTERVAL_MS);
      console.log(`⏰ Next cleanup check in ${this.CLEANUP_INTERVAL_MS / 1000 / 60} minutes`);
    }
  }

  /**
   * Destroy session and clean up all resources
   * IMPORTANT: This is the ONLY way to avoid billing for inactive DOs
   */
  private async destroySession() {
    // Clear in-memory state
    this.sessionManager = null;
    this.sessionData = {
      doId: null,
      sessionId: null,
      audioKeys: [],
      createdAt: 0,
      lastAccessedAt: 0,
    };

    // Delete alarm first (required before deleteAll if alarms are used)
    await this.ctx.storage.deleteAlarm();

    // Delete ALL storage data (required to stop billing)
    await this.ctx.storage.deleteAll();

    console.log(`✅ Session destroyed, alarm and storage cleared to avoid billing`);

    // Note: DO instance may still exist in memory for a short time,
    // but with empty storage it won't be billed
  }

  /**
   * Update last accessed timestamp
   */
  private async touchSession() {
    const now = Date.now();
    this.sessionData.lastAccessedAt = now;
    await this.ctx.storage.put('sessionData', this.sessionData);
  }

  /**
   * Create a new session with audio tracks
   * NOTE: Audio buffers are stored in SessionManager's memory for slice generation
   * This is unavoidable with the current secstream architecture
   *
   * @param doId - The Durable Object ID (used for routing to this DO)
   * @param audioKeys - Array of R2 object keys for the audio files
   * @param audioBuffers - Array of audio file buffers
   * @returns The DO ID (used for routing, NOT the internal SessionManager ID)
   */
  async createSession(doId: string, audioKeys: string[], audioBuffers: ArrayBuffer[]): Promise<string> {
    const manager = this.ensureSessionManager();

    let internalSessionId: string;

    if (audioKeys.length > 1) {
      // Multi-track session
      const tracks = audioBuffers.map((buffer, index) => ({
        audioData: buffer,
        metadata: {
          title: `Track ${index + 1}`,
        },
      }));
      internalSessionId = await manager.createMultiTrackSession(tracks);
    } else {
      // Single track session
      internalSessionId = await manager.createSession(audioBuffers[0]);
    }

    const now = Date.now();

    // Store session metadata
    this.sessionData = {
      doId,  // Store the DO ID for verification
      sessionId: internalSessionId,  // Internal SessionManager ID
      audioKeys,
      createdAt: now,
      lastAccessedAt: now,
    };

    // Persist to storage
    await this.ctx.storage.put('sessionData', this.sessionData);

    console.log(`✅ Created session in DO ${doId} (internal ID: ${internalSessionId}) with ${audioKeys.length} tracks`);
    console.log(`📊 Audio data size: ${audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0) / 1024 / 1024} MB in memory`);

    // Return the DO ID for client routing (NOT the internal SessionManager ID)
    return doId;
  }

  /**
   * Handle key exchange for encryption
   * @param doId - The Durable Object ID (for routing verification)
   */
  async handleKeyExchange(
    doId: string,
    request: ProcessorKeyExchangeRequest<unknown>,
    trackId?: string
  ): Promise<ProcessorKeyExchangeResponse<unknown, unknown>> {
    const manager = this.ensureSessionManager();

    // Verify DO ID matches (sessionData loaded in constructor)
    if (this.sessionData.doId !== doId) {
      throw new Error(`Session ${doId} not found in this Durable Object (has: ${this.sessionData.doId})`);
    }

    // Update last accessed time
    await this.touchSession();

    // Use the internal SessionManager ID for the actual secstream call
    const response = await manager.handleKeyExchange(this.sessionData.sessionId!, request, trackId);

    // Replace internal session ID with DO ID in the response
    if (response.sessionInfo && typeof response.sessionInfo === 'object') {
      (response.sessionInfo as any).sessionId = doId;
    }

    console.log(`🔑 Key exchange completed for DO ${doId} (internal: ${this.sessionData.sessionId})${trackId ? ` (track: ${trackId})` : ''}`);
    return response;
  }

  /**
   * Get session info
   * @param doId - The Durable Object ID (for routing verification)
   */
  async getSessionInfo(doId: string) {
    const manager = this.ensureSessionManager();

    // Verify DO ID matches (sessionData loaded in constructor)
    if (this.sessionData.doId !== doId) {
      throw new Error(`Session ${doId} not found in this Durable Object (has: ${this.sessionData.doId})`);
    }

    // Update last accessed time
    await this.touchSession();

    // Use the internal SessionManager ID for the actual secstream call
    const info = manager.getSessionInfo(this.sessionData.sessionId!);

    // Replace internal session ID with DO ID before returning
    if (info) {
      info.sessionId = doId;
    }

    console.log(`📋 Retrieved session info for DO ${doId} (internal: ${this.sessionData.sessionId})`);
    return info;
  }

  /**
   * Get encrypted audio slice
   * @param doId - The Durable Object ID (for routing verification)
   */
  async getSlice(doId: string, sliceId: string, trackId?: string) {
    const manager = this.ensureSessionManager();

    // Verify DO ID matches (sessionData loaded in constructor)
    if (this.sessionData.doId !== doId) {
      throw new Error(`Session ${doId} not found in this Durable Object (has: ${this.sessionData.doId})`);
    }

    // Update last accessed time
    await this.touchSession();

    // Use the internal SessionManager ID for the actual secstream call
    const slice = await manager.getSlice(this.sessionData.sessionId!, sliceId, trackId);

    // Replace internal session ID with DO ID in the slice response
    if (slice) {
      slice.sessionId = doId;
    }

    console.log(`🔐 Retrieved slice ${sliceId} for DO ${doId} (internal: ${this.sessionData.sessionId})${trackId ? ` (track: ${trackId})` : ''}`);
    return slice;
  }

  /**
   * Get session metadata (returns in-memory data)
   * Storage is already loaded in constructor, no need to read again
   */
  getSessionMetadata() {
    return this.sessionData;
  }
}
