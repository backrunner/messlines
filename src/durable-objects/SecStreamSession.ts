import { DurableObject } from 'cloudflare:workers';
import { SessionManager } from 'secstream/server';
import { SECSTREAM_CONFIG } from '../constants/playlist';
import { AudioFileHandler } from '../utils/secstream';
import type { ProcessorKeyExchangeRequest, ProcessorKeyExchangeResponse } from 'secstream/server';

/**
 * Durable Object for persisting secstream session state
 * Each session gets its own DO instance that persists across worker invocations
 *
 * Memory-efficient architecture:
 * - Only session metadata is persisted to storage
 * - Audio buffers are NEVER stored in DO memory persistently
 * - Audio is fetched from R2 on-demand when SessionManager is needed
 * - SessionManager is kept in memory (transient) only while DO is active
 * - When DO hibernates, SessionManager is evicted (saving memory/costs)
 *
 * Lifecycle:
 * - Sessions expire after 2 hours of inactivity
 * - Automatic cleanup via alarms
 * - Storage is deleted to avoid billing
 */
export class SecStreamSession extends DurableObject {
  // Transient: Not persisted, recreated on-demand
  private sessionManager: SessionManager | null = null;
  private audioHandler: AudioFileHandler;

  // Persisted: Stored in DO storage
  private sessionData: {
    doId: string | null;  // The Durable Object ID (used for routing)
    sessionId: string | null;  // The internal SessionManager ID (for secstream calls)
    audioKeys: string[];  // R2 keys for audio files (used to fetch on-demand)
    createdAt: number;
    lastAccessedAt: number;
  } = {
    doId: null,
    sessionId: null,
    audioKeys: [],
    createdAt: 0,
    lastAccessedAt: 0,
  };

  // Rate limiting state (transient, not persisted)
  private sliceRequestTimestamps: number[] = [];
  private keyExchangeTimestamps: number[] = [];

  // Session expires after 2 hours of inactivity
  private readonly SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
  // Check for cleanup every 30 minutes
  private readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

  // Rate limiting configuration
  // Normal playback with 3s slices + 3-slice prefetch ≈ 1-2 req/s
  // Allow burst for seeking/track changes
  private readonly MAX_SLICE_REQUESTS_PER_WINDOW = 15; // Max 15 slice requests
  private readonly SLICE_RATE_WINDOW_MS = 5 * 1000; // in 5 seconds
  private readonly MAX_KEY_EXCHANGES_PER_WINDOW = 10; // Max 10 key exchanges
  private readonly KEY_EXCHANGE_RATE_WINDOW_MS = 60 * 1000; // in 60 seconds

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.audioHandler = new AudioFileHandler();

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
   * Fetch audio buffers from R2 for the session
   * Uses cached data if available to minimize R2 requests
   */
  private async fetchAudioBuffers(): Promise<ArrayBuffer[]> {
    const bucket = this.env.AUDIO_BUCKET;
    if (!bucket) {
      throw new Error('R2 bucket not available');
    }

    console.log(`📦 Fetching ${this.sessionData.audioKeys.length} audio files from R2...`);
    const audioBuffers: ArrayBuffer[] = [];

    for (const key of this.sessionData.audioKeys) {
      const buffer = await this.audioHandler.getAudioFromBucket(key, bucket);
      audioBuffers.push(buffer);
      console.log(`✅ Fetched audio from R2: ${key} (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
    }

    const totalSize = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    console.log(`📊 Total audio size: ${(totalSize / 1024 / 1024).toFixed(2)} MB (loaded transiently, will be evicted on DO hibernation)`);

    return audioBuffers;
  }

  /**
   * Check if slice request rate limit is exceeded
   * Implements sliding window rate limiting
   */
  private checkSliceRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - this.SLICE_RATE_WINDOW_MS;

    // Remove timestamps outside the current window
    this.sliceRequestTimestamps = this.sliceRequestTimestamps.filter(ts => ts > windowStart);

    // Check if limit exceeded
    if (this.sliceRequestTimestamps.length >= this.MAX_SLICE_REQUESTS_PER_WINDOW) {
      console.warn(`⚠️ Slice rate limit exceeded for session ${this.sessionData.doId}`);
      return false;
    }

    // Add current request timestamp
    this.sliceRequestTimestamps.push(now);
    return true;
  }

  /**
   * Check if key exchange rate limit is exceeded
   * Implements sliding window rate limiting
   */
  private checkKeyExchangeRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - this.KEY_EXCHANGE_RATE_WINDOW_MS;

    // Remove timestamps outside the current window
    this.keyExchangeTimestamps = this.keyExchangeTimestamps.filter(ts => ts > windowStart);

    // Check if limit exceeded
    if (this.keyExchangeTimestamps.length >= this.MAX_KEY_EXCHANGES_PER_WINDOW) {
      console.warn(`⚠️ Key exchange rate limit exceeded for session ${this.sessionData.doId}`);
      return false;
    }

    // Add current request timestamp
    this.keyExchangeTimestamps.push(now);
    return true;
  }

  /**
   * Initialize the session manager if not already initialized
   * Fetches audio from R2 on-demand when needed
   */
  private async ensureSessionManager(): Promise<SessionManager> {
    // If SessionManager already exists in memory, return it
    if (this.sessionManager) {
      console.log(`♻️ Using existing SessionManager from memory`);
      return this.sessionManager;
    }

    // SessionManager not in memory - need to create it
    // This happens on:
    // 1. First key exchange after session creation
    // 2. DO reactivated from hibernation
    console.log(`🔄 SessionManager not in memory, recreating from R2 audio...`);

    // Fetch audio from R2
    const audioBuffers = await this.fetchAudioBuffers();

    // Create SessionManager
    const manager = new SessionManager({
      sliceDurationMs: SECSTREAM_CONFIG.sliceDurationMs,
      compressionLevel: SECSTREAM_CONFIG.compressionLevel,
      prewarmSlices: SECSTREAM_CONFIG.prewarmSlices,
      prewarmConcurrency: SECSTREAM_CONFIG.prewarmConcurrency,
      serverCacheSize: SECSTREAM_CONFIG.serverCacheSize,
      serverCacheTtlMs: SECSTREAM_CONFIG.serverCacheTtlMs,
    });

    // Create session in SessionManager with audio
    let internalSessionId: string;
    if (this.sessionData.audioKeys.length > 1) {
      // Multi-track session
      const tracks = audioBuffers.map((buffer, index) => ({
        audioData: buffer,
        metadata: { title: `Track ${index + 1}` },
      }));
      internalSessionId = await manager.createMultiTrackSession(tracks);
    } else {
      // Single track session
      internalSessionId = await manager.createSession(audioBuffers[0]);
    }

    // Update session data with internal ID (if this is first time)
    if (!this.sessionData.sessionId) {
      this.sessionData.sessionId = internalSessionId;
      await this.ctx.storage.put('sessionData', this.sessionData);
    }

    // Store manager in memory (transient)
    this.sessionManager = manager;

    console.log(`✅ SessionManager created and cached in memory (internal ID: ${internalSessionId})`);
    return manager;
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
   * NOTE: Audio is NOT loaded into memory at this stage
   * It will be fetched from R2 on-demand during key exchange
   *
   * @param doId - The Durable Object ID (used for routing to this DO)
   * @param audioKeys - Array of R2 object keys for the audio files
   * @returns The DO ID (used for routing)
   */
  async createSession(doId: string, audioKeys: string[]): Promise<string> {
    const now = Date.now();

    // Store session metadata ONLY (no audio buffers)
    this.sessionData = {
      doId,  // Store the DO ID for verification
      sessionId: null,  // Will be set when SessionManager is created (during key exchange)
      audioKeys,  // Store R2 keys for on-demand fetching
      createdAt: now,
      lastAccessedAt: now,
    };

    // Persist to storage
    await this.ctx.storage.put('sessionData', this.sessionData);

    console.log(`✅ Created lightweight session in DO ${doId} with ${audioKeys.length} audio keys`);
    console.log(`📝 Audio keys stored for lazy loading: ${audioKeys.join(', ')}`);
    console.log(`💾 Memory footprint: ~${JSON.stringify(this.sessionData).length} bytes (vs ~50MB if audio was loaded)`);

    // Return the DO ID for client routing
    return doId;
  }

  /**
   * Handle key exchange for encryption
   * This is where audio is actually loaded from R2 (lazy loading)
   * @param doId - The Durable Object ID (for routing verification)
   */
  async handleKeyExchange(
    doId: string,
    request: ProcessorKeyExchangeRequest<unknown>,
    trackId?: string
  ): Promise<ProcessorKeyExchangeResponse<unknown, unknown>> {
    // Verify DO ID matches (sessionData loaded in constructor)
    if (this.sessionData.doId !== doId) {
      throw new Error(`Session ${doId} not found in this Durable Object (has: ${this.sessionData.doId})`);
    }

    // Check rate limit for key exchanges
    if (!this.checkKeyExchangeRateLimit()) {
      throw new Error('Too many requests. Please try again later.');
    }

    // Update last accessed time
    await this.touchSession();

    // Ensure SessionManager is initialized (fetches audio from R2 if needed)
    const manager = await this.ensureSessionManager();

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
    // Verify DO ID matches (sessionData loaded in constructor)
    if (this.sessionData.doId !== doId) {
      throw new Error(`Session ${doId} not found in this Durable Object (has: ${this.sessionData.doId})`);
    }

    // Check rate limit for slice requests
    if (!this.checkSliceRateLimit()) {
      throw new Error('Too many requests. Please try again later.');
    }

    // Update last accessed time
    await this.touchSession();

    // Ensure SessionManager is initialized (fetches audio from R2 if needed)
    const manager = await this.ensureSessionManager();

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
