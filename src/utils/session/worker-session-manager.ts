import { SessionManager } from 'secstream/server';
import type { EncryptedSlice, SessionInfo } from 'secstream/server';
import type { ProcessorKeyExchangeRequest, ProcessorKeyExchangeResponse } from 'secstream/server';
import { SECSTREAM_CONFIG } from '../../constants/playlist';
import { AudioFileHandler } from '../audio/secstream';

/**
 * Worker-level SessionManager wrapper
 * Manages SessionManager instances in worker memory, not in Durable Objects
 * This architecture minimizes DO costs by keeping audio processing in the worker
 *
 * Architecture:
 * - Durable Object: Stores only session metadata (~1KB)
 * - Worker: Fetches audio from R2, generates slices locally
 * - No audio data transferred through DO (eliminates 5-second delay)
 */
export class WorkerSessionManager {
  private sessionManagers: Map<string, SessionManager> = new Map();
  private sessionIdMapping: Map<string, string> = new Map(); // external -> internal sessionId
  private audioHandler: AudioFileHandler;

  constructor() {
    this.audioHandler = new AudioFileHandler();
  }

  /**
   * Get or create SessionManager for a session
   * Fetches audio from R2 on-demand (lazy loading)
   * In dev mode, fetches audio from local filesystem if R2 is not available
   */
  private async ensureSessionManager(
    sessionId: string,
    audioKeys: string[],
    bucket?: R2Bucket
  ): Promise<SessionManager> {
    // Check if SessionManager already exists in worker memory
    let manager = this.sessionManagers.get(sessionId);
    if (manager) {
      console.log(`♻️ Using existing SessionManager from worker memory for session ${sessionId}`);
      return manager;
    }

    // SessionManager not in memory - need to create it
    console.log(`🔄 Creating SessionManager in worker for session ${sessionId}...`);

    // Fetch audio from R2 or local filesystem
    const audioBuffers: ArrayBuffer[] = [];
    const source = bucket ? 'R2' : 'local filesystem';
    console.log(`📦 Fetching audio from ${source}...`);

    for (const key of audioKeys) {
      const buffer = await this.audioHandler.getAudioFromBucket(key, bucket);
      audioBuffers.push(buffer);
      console.log(`✅ Fetched audio: ${key} (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
    }

    const totalSize = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    console.log(`📊 Total audio size: ${(totalSize / 1024 / 1024).toFixed(2)} MB (loaded in worker memory)`);

    // Create SessionManager in worker memory
    manager = new SessionManager({
      sliceDurationMs: SECSTREAM_CONFIG.sliceDurationMs,
      compressionLevel: SECSTREAM_CONFIG.compressionLevel,
      prewarmSlices: SECSTREAM_CONFIG.prewarmSlices,
      prewarmConcurrency: SECSTREAM_CONFIG.prewarmConcurrency,
      serverCacheSize: SECSTREAM_CONFIG.serverCacheSize,
      serverCacheTtlMs: SECSTREAM_CONFIG.serverCacheTtlMs,
    });

    // Create session in SessionManager with audio
    let internalSessionId: string;
    if (audioKeys.length > 1) {
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

    console.log(`✅ SessionManager created in worker (external: ${sessionId}, internal: ${internalSessionId})`);

    // Store manager and session ID mapping in worker memory
    this.sessionManagers.set(sessionId, manager);
    this.sessionIdMapping.set(sessionId, internalSessionId);

    return manager;
  }

  /**
   * Handle key exchange
   * Session metadata is retrieved from storage, but audio processing happens in worker
   * @param doId - Durable Object ID (returned to client for routing)
   * @param internalSessionId - Internal session ID (used internally for SessionManager)
   */
  async handleKeyExchange<TRequestData = unknown, TResponseData = unknown>(
    doId: string,
    internalSessionId: string,
    audioKeys: string[],
    request: ProcessorKeyExchangeRequest<TRequestData>,
    bucket?: R2Bucket,
    trackId?: string
  ): Promise<ProcessorKeyExchangeResponse<TResponseData, SessionInfo>> {
    const manager = await this.ensureSessionManager(internalSessionId, audioKeys, bucket);

    // Get the internal session ID for this external session ID
    const storedInternalSessionId = this.sessionIdMapping.get(internalSessionId);
    if (!storedInternalSessionId) {
      throw new Error(`Session mapping not found for ${internalSessionId}`);
    }

    // Perform key exchange in worker using internal session ID
    const response = await manager.handleKeyExchange<TRequestData, TResponseData>(storedInternalSessionId, request, trackId);

    // Replace internal session ID with DO ID in the response
    // so the client uses the DO ID for subsequent requests
    if (response.sessionInfo) {
      response.sessionInfo = {
        ...response.sessionInfo,
        sessionId: doId, // Use DO ID for client routing
      };
    }

    console.log(`🔑 Key exchange completed in worker for DO ${doId} (internal: ${internalSessionId})${trackId ? ` (track: ${trackId})` : ''}`);
    return response;
  }

  /**
   * Get session info
   */
  async getSessionInfo(
    sessionId: string,
    audioKeys: string[],
    bucket?: R2Bucket
  ): Promise<SessionInfo | null> {
    const manager = await this.ensureSessionManager(sessionId, audioKeys, bucket);

    // Get the internal session ID for this external session ID
    const internalSessionId = this.sessionIdMapping.get(sessionId);
    if (!internalSessionId) {
      throw new Error(`Session mapping not found for ${sessionId}`);
    }

    const info = manager.getSessionInfo(internalSessionId);

    console.log(`📋 Retrieved session info in worker for session ${sessionId}`);

    // Replace internal session ID with external session ID
    if (info) {
      return {
        ...info,
        sessionId: sessionId, // Use external session ID
      };
    }

    return info;
  }

  /**
   * Get encrypted audio slice
   * This is where we save the 5-second delay - slice generation happens in worker, not DO
   */
  async getSlice(
    sessionId: string,
    audioKeys: string[],
    sliceId: string,
    bucket?: R2Bucket,
    trackId?: string
  ): Promise<EncryptedSlice | null> {
    const startTime = Date.now();

    const manager = await this.ensureSessionManager(sessionId, audioKeys, bucket);

    const ensureTime = Date.now() - startTime;
    console.log(`⏱️ ensureSessionManager took ${ensureTime}ms`);

    // Get the internal session ID for this external session ID
    const internalSessionId = this.sessionIdMapping.get(sessionId);
    if (!internalSessionId) {
      throw new Error(`Session mapping not found for ${sessionId}`);
    }

    // Generate slice in worker (no DO data transfer!) using internal session ID
    const sliceStartTime = Date.now();
    const slice = await manager.getSlice(internalSessionId, sliceId, trackId);
    const sliceTime = Date.now() - sliceStartTime;

    console.log(`🔐 Generated slice ${sliceId} in worker for session ${sessionId}${trackId ? ` (track: ${trackId})` : ''} - slice generation: ${sliceTime}ms, total: ${Date.now() - startTime}ms`);
    return slice;
  }

  /**
   * Destroy session and free memory
   */
  destroySession(sessionId: string): void {
    const manager = this.sessionManagers.get(sessionId);
    const internalSessionId = this.sessionIdMapping.get(sessionId);

    if (manager && internalSessionId) {
      manager.destroySession(internalSessionId);
      this.sessionManagers.delete(sessionId);
      this.sessionIdMapping.delete(sessionId);
      console.log(`🧹 Destroyed SessionManager in worker for session ${sessionId} (internal: ${internalSessionId})`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeSessionManagers: this.sessionManagers.size,
    };
  }
}
