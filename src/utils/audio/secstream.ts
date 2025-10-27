import { SessionManager } from 'secstream/server';
import { SECSTREAM_CONFIG } from '../../constants/playlist';
import fs from 'node:fs';
import path from 'node:path';

// Create session manager with configuration from playlist constants
export function createSessionManager(): SessionManager {

  return new SessionManager({
    // Basic slicing configuration
    sliceDurationMs: SECSTREAM_CONFIG.sliceDurationMs,
    compressionLevel: SECSTREAM_CONFIG.compressionLevel,

    // Streaming optimization - prewarm slices during key exchange for instant playback
    prewarmSlices: SECSTREAM_CONFIG.prewarmSlices,
    prewarmConcurrency: SECSTREAM_CONFIG.prewarmConcurrency,

    // Server-side caching for performance
    serverCacheSize: SECSTREAM_CONFIG.serverCacheSize,
    serverCacheTtlMs: SECSTREAM_CONFIG.serverCacheTtlMs,
  });
}

// Audio file handler for R2 bucket operations
export class AudioFileHandler {
  // Get audio file from R2 bucket or local filesystem
  async getAudioFromBucket(audioKey: string, bucket?: R2Bucket): Promise<ArrayBuffer> {
    // If no bucket provided (dev mode), try to load from local filesystem
    if (!bucket) {
      return this.getAudioFromLocalFilesystem(audioKey);
    }

    try {
      const object = await bucket.get(audioKey);
      if (!object) {
        throw new Error(`Audio file not found: ${audioKey}`);
      }

      const arrayBuffer = await object.arrayBuffer();
      console.log(`📦 Retrieved audio file from R2: ${audioKey} (${arrayBuffer.byteLength} bytes)`);
      return arrayBuffer;
    } catch (error) {
      console.error('❌ Failed to retrieve audio from bucket:', error);
      throw new Error(`Failed to retrieve audio file: ${audioKey}`);
    }
  }

  // Get audio file from local filesystem (dev mode only)
  private async getAudioFromLocalFilesystem(audioKey: string): Promise<ArrayBuffer> {
    try {
      // In dev mode, audio files are in public/audios/
      const filePath = path.join(process.cwd(), 'public', 'audios', audioKey);

      console.log(`📂 [DEV] Loading audio from filesystem: ${filePath}`);

      const buffer = await fs.promises.readFile(filePath);

      // Convert Node.js Buffer to ArrayBuffer
      const arrayBuffer = new ArrayBuffer(buffer.byteLength);
      const view = new Uint8Array(arrayBuffer);
      view.set(buffer);

      console.log(`📂 [DEV] Retrieved audio file: ${audioKey} (${arrayBuffer.byteLength} bytes)`);
      return arrayBuffer;
    } catch (error) {
      console.error('❌ [DEV] Failed to retrieve audio from filesystem:', error);
      throw new Error(`Failed to retrieve audio file from filesystem: ${audioKey}`);
    }
  }

  // List available audio files in bucket
  async listAudioFiles(bucket: R2Bucket, prefix: string = 'audio/'): Promise<string[]> {
    try {
      const objects = await bucket.list({ prefix });
      const audioFiles = objects.objects
        .map(obj => obj.key)
        .filter(key => {
          const extension = key.toLowerCase().split('.').pop();
          return extension && ['mp3', 'wav', 'flac', 'ogg'].includes(extension);
        });

      console.log(`📦 Found ${audioFiles.length} audio files in bucket`);
      return audioFiles;
    } catch (error) {
      console.error('❌ Failed to list audio files:', error);
      throw new Error('Failed to list audio files from bucket');
    }
  }
}