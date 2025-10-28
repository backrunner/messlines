/**
 * R2-based PCM Cache for SecStream Audio Processing
 *
 * Problem: Audio files (MP3/FLAC) need to be decoded to PCM every time a SessionManager
 * is created. This decoding is CPU-intensive and happens frequently since worker memory
 * is ephemeral.
 *
 * Solution: Cache pre-decoded PCM data as WAV files in R2
 * - WAV files contain raw PCM data with minimal headers
 * - "Decoding" WAV is ~100x faster than decoding MP3/FLAC
 * - R2 storage is cheap and persistent across worker instances
 *
 * Architecture:
 * 1. Check R2 for cached PCM (audioKey + ".pcm.wav")
 * 2. If exists: Return cached WAV (fast path)
 * 3. If not: Decode original audio → WAV → Cache in R2 → Return WAV
 *
 * Benefits:
 * - First request: Decode once and cache (one-time cost)
 * - Subsequent requests: Load WAV directly (100x faster)
 * - Scales across all worker instances
 */

export interface PcmCacheConfig {
  // R2 bucket for caching PCM data
  pcmCacheBucket?: R2Bucket;

  // Prefix for PCM cache keys in R2 (e.g., "pcm-cache/")
  pcmCachePrefix?: string;

  // Enable/disable PCM caching
  enabled?: boolean;

  // Force re-generation of cache (useful for debugging)
  forceRegenerate?: boolean;
}

export interface PcmCacheResult {
  // The audio data (either original or cached PCM WAV)
  audioData: ArrayBuffer;

  // Whether this data came from cache
  fromCache: boolean;

  // Size of the data in bytes
  size: number;

  // Time taken to retrieve/generate in milliseconds
  timeMs: number;
}

/**
 * PCM Cache Manager
 * Handles caching of decoded PCM audio data in R2 bucket
 */
export class PcmCacheManager {
  private config: Required<PcmCacheConfig>;

  constructor(config: PcmCacheConfig = {}) {
    this.config = {
      pcmCacheBucket: config.pcmCacheBucket ?? undefined,
      pcmCachePrefix: config.pcmCachePrefix ?? 'pcm-cache/',
      enabled: config.enabled ?? true,
      forceRegenerate: config.forceRegenerate ?? false,
    } as Required<PcmCacheConfig>;
  }

  /**
   * Get PCM cache key for an audio file
   */
  private getCacheKey(audioKey: string): string {
    // Remove extension and add .pcm.wav suffix
    const baseKey = audioKey.replace(/\.[^.]+$/, '');
    return `${this.config.pcmCachePrefix}${baseKey}.pcm.wav`;
  }

  /**
   * Check if PCM cache exists for an audio file
   */
  private async cacheExists(audioKey: string, bucket?: R2Bucket): Promise<boolean> {
    if (!bucket || !this.config.enabled || this.config.forceRegenerate) {
      return false;
    }

    const cacheKey = this.getCacheKey(audioKey);
    const object = await bucket.head(cacheKey);
    return object !== null;
  }

  /**
   * Get cached PCM data from R2
   */
  private async getCachedPcm(audioKey: string, bucket?: R2Bucket): Promise<ArrayBuffer | null> {
    if (!bucket || !this.config.enabled || this.config.forceRegenerate) {
      return null;
    }

    const cacheKey = this.getCacheKey(audioKey);
    const object = await bucket.get(cacheKey);

    if (!object) {
      return null;
    }

    return await object.arrayBuffer();
  }

  /**
   * Store PCM data in R2 cache
   */
  private async storePcmCache(audioKey: string, pcmWavData: ArrayBuffer, bucket?: R2Bucket): Promise<void> {
    if (!bucket || !this.config.enabled) {
      return;
    }

    const cacheKey = this.getCacheKey(audioKey);

    await bucket.put(cacheKey, pcmWavData, {
      httpMetadata: {
        contentType: 'audio/wav',
      },
      customMetadata: {
        originalAudioKey: audioKey,
        generatedAt: new Date().toISOString(),
      },
    });

    console.log(`💾 Stored PCM cache: ${cacheKey} (${(pcmWavData.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  }

  /**
   * Decode audio to WAV format (PCM with headers)
   * Uses Web Audio API to decode and then converts to WAV
   */
  private async decodeToWav(audioData: ArrayBuffer): Promise<ArrayBuffer> {
    const startTime = Date.now();

    // Use Web Audio API to decode audio to PCM
    const audioContext = new OfflineAudioContext(2, 44100 * 180, 44100); // Max 3 min, 44.1kHz
    const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0));

    console.log(`🎵 Decoded audio: ${audioBuffer.numberOfChannels} channels, ${audioBuffer.sampleRate} Hz, ${audioBuffer.duration.toFixed(2)}s`);

    // Convert AudioBuffer to WAV format
    const wavData = this.audioBufferToWav(audioBuffer);

    const decodeTime = Date.now() - startTime;
    console.log(`⚡ Audio decoded to WAV in ${decodeTime}ms (${(wavData.byteLength / 1024 / 1024).toFixed(2)} MB)`);

    return wavData;
  }

  /**
   * Convert AudioBuffer to WAV format
   * WAV = PCM data with minimal headers (RIFF format)
   */
  private audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2; // 16-bit = 2 bytes per sample

    // WAV file structure:
    // - RIFF header (12 bytes)
    // - fmt chunk (24 bytes)
    // - data chunk header (8 bytes)
    // - PCM data

    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    this.writeString(view, 8, 'WAVE');

    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true); // byte rate
    view.setUint16(32, numberOfChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample

    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    // Write PCM data (interleaved)
    const offset = 44;
    const channels: Float32Array[] = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let index = offset;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        // Convert float32 [-1, 1] to int16 [-32768, 32767]
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(index, int16, true);
        index += 2;
      }
    }

    return buffer;
  }

  /**
   * Write string to DataView
   */
  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Get audio data with PCM caching
   * This is the main entry point for the cache
   *
   * @param audioKey - R2 key for the original audio file
   * @param originalAudioData - Original audio data (MP3/FLAC/etc)
   * @param bucket - R2 bucket for PCM cache storage (optional, required for caching)
   * @returns PCM cache result with audio data and metadata
   */
  async getAudioWithCache(
    audioKey: string,
    originalAudioData: ArrayBuffer,
    bucket?: R2Bucket
  ): Promise<PcmCacheResult> {
    const startTime = Date.now();

    // Check if PCM caching is enabled and bucket is available
    if (!this.config.enabled || !bucket) {
      console.log(`ℹ️ PCM cache disabled for ${audioKey}, using original audio`);
      return {
        audioData: originalAudioData,
        fromCache: false,
        size: originalAudioData.byteLength,
        timeMs: Date.now() - startTime,
      };
    }

    try {
      // Try to get cached PCM
      console.log(`🔍 Checking PCM cache for ${audioKey}...`);
      const cachedPcm = await this.getCachedPcm(audioKey, bucket);

      if (cachedPcm) {
        const timeMs = Date.now() - startTime;
        console.log(`✅ PCM cache HIT for ${audioKey} (${(cachedPcm.byteLength / 1024 / 1024).toFixed(2)} MB, ${timeMs}ms)`);
        return {
          audioData: cachedPcm,
          fromCache: true,
          size: cachedPcm.byteLength,
          timeMs,
        };
      }

      // Cache miss - decode and store
      console.log(`⚠️ PCM cache MISS for ${audioKey}, decoding and caching...`);
      const pcmWavData = await this.decodeToWav(originalAudioData);

      // Store in cache (async, don't wait)
      this.storePcmCache(audioKey, pcmWavData, bucket).catch((error) => {
        console.error(`❌ Failed to store PCM cache for ${audioKey}:`, error);
      });

      const timeMs = Date.now() - startTime;
      console.log(`✅ PCM generated and cached for ${audioKey} (${timeMs}ms)`);

      return {
        audioData: pcmWavData,
        fromCache: false,
        size: pcmWavData.byteLength,
        timeMs,
      };
    } catch (error) {
      console.error(`❌ PCM cache error for ${audioKey}:`, error);
      console.log(`⚠️ Falling back to original audio data`);

      // Fallback to original audio on error
      return {
        audioData: originalAudioData,
        fromCache: false,
        size: originalAudioData.byteLength,
        timeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Pre-warm PCM cache for multiple audio files
   * Useful for warming up cache during deployment or maintenance
   */
  async prewarmCache(audioKeys: string[], audioDataGetter: (key: string) => Promise<ArrayBuffer>, bucket?: R2Bucket): Promise<void> {
    if (!bucket) {
      console.log(`⚠️ Cannot prewarm PCM cache without R2 bucket`);
      return;
    }

    console.log(`🔥 Pre-warming PCM cache for ${audioKeys.length} files...`);

    const results = await Promise.allSettled(
      audioKeys.map(async (audioKey) => {
        const exists = await this.cacheExists(audioKey, bucket);
        if (exists && !this.config.forceRegenerate) {
          console.log(`✅ PCM cache already exists for ${audioKey}`);
          return;
        }

        const audioData = await audioDataGetter(audioKey);
        await this.getAudioWithCache(audioKey, audioData, bucket);
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ PCM cache pre-warm complete: ${successful} succeeded, ${failed} failed`);
  }

  /**
   * Clear PCM cache for specific audio files
   */
  async clearCache(audioKeys: string[], bucket?: R2Bucket): Promise<void> {
    if (!bucket) {
      console.log(`⚠️ Cannot clear PCM cache without R2 bucket`);
      return;
    }

    console.log(`🗑️ Clearing PCM cache for ${audioKeys.length} files...`);

    await Promise.all(
      audioKeys.map(async (audioKey) => {
        const cacheKey = this.getCacheKey(audioKey);
        await bucket.delete(cacheKey);
        console.log(`✅ Deleted PCM cache: ${cacheKey}`);
      })
    );
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(audioKeys: string[], bucket?: R2Bucket): Promise<{
    totalKeys: number;
    cachedKeys: number;
    uncachedKeys: number;
    cacheHitRate: number;
  }> {
    if (!bucket) {
      return {
        totalKeys: audioKeys.length,
        cachedKeys: 0,
        uncachedKeys: audioKeys.length,
        cacheHitRate: 0,
      };
    }

    const results = await Promise.all(
      audioKeys.map(key => this.cacheExists(key, bucket))
    );

    const cachedKeys = results.filter(exists => exists).length;
    const uncachedKeys = audioKeys.length - cachedKeys;
    const cacheHitRate = audioKeys.length > 0 ? (cachedKeys / audioKeys.length) * 100 : 0;

    return {
      totalKeys: audioKeys.length,
      cachedKeys,
      uncachedKeys,
      cacheHitRate,
    };
  }
}
