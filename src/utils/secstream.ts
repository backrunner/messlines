import type { SessionManager } from 'secstream/server';
import { SECSTREAM_CONFIG } from '../constants/playlist';

// Create session manager with configuration from playlist constants
export function createSessionManager(): SessionManager {
  const { SessionManager } = require('secstream/server');

  return new SessionManager({
    sliceDurationMs: SECSTREAM_CONFIG.sliceDurationMs,
    compressionLevel: SECSTREAM_CONFIG.compressionLevel,
  });
}

// Audio file handler for R2 bucket operations
export class AudioFileHandler {
  // Get audio file from R2 bucket
  async getAudioFromBucket(audioKey: string, bucket: R2Bucket): Promise<ArrayBuffer> {
    try {
      const object = await bucket.get(audioKey);
      if (!object) {
        throw new Error(`Audio file not found: ${audioKey}`);
      }

      const arrayBuffer = await object.arrayBuffer();
      console.log(`📦 Retrieved audio file: ${audioKey} (${arrayBuffer.byteLength} bytes)`);
      return arrayBuffer;
    } catch (error) {
      console.error('❌ Failed to retrieve audio from bucket:', error);
      throw new Error(`Failed to retrieve audio file: ${audioKey}`);
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