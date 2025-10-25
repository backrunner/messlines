import type { CompressionLevel } from 'secstream/server';

export interface AudioTrack {
  id: number;
  title: string;
  audioKey: string;
  duration?: number;
  coverKey?: string;
}

export const AUDIO_PLAYLIST: AudioTrack[] = [
  {
    id: 0,
    title: "Guide Line",
    audioKey: "audio/guide_line.mp3"
  },
  {
    id: 1,
    title: "Falling Flowers",
    audioKey: "audio/falling_flowers.mp3",
    coverKey: "cover/falling_flowers.png"
  },
  {
    id: 2,
    title: "Soul Flashback",
    audioKey: "audio/soul_flashback.mp3",
    coverKey: "cover/soul_flashback.png"
  },
  {
    id: 3,
    title: "Sink in Sick",
    audioKey: "audio/sink_in_sick.mp3",
    coverKey: "cover/sink_in_sick.png"
  },
];

export const SECSTREAM_CONFIG = {
  // Server-side configuration
  sliceDurationMs: 5000,
  compressionLevel: 6 as CompressionLevel,

  // Streaming optimization - prewarm slices during key exchange for instant playback
  prewarmSlices: 3,              // Prepare first 3 slices (15 seconds) during key exchange
  prewarmConcurrency: 3,         // Parallel workers for prewarming

  // Cache settings
  serverCacheSize: 10,           // Keep 10 slices in memory
  serverCacheTtlMs: 300_000,     // Cache for 5 minutes

  // Client-side uses AggressiveBufferStrategy with LinearPrefetchStrategy
  // - AggressiveBufferStrategy: Keeps more slices for smoother playback
  // - LinearPrefetchStrategy: Linear prefetch ahead

  maxFileSize: 100 * 1024 * 1024,
  sessionTimeout: 60 * 60 * 1000,
  allowedFormats: ['audio/wav', 'audio/mp3', 'audio/flac', 'audio/ogg', 'audio/mpeg'],

  // Web Worker configuration for background decryption
  workerConfig: {
    enabled: true,        // Workers now support CryptoKey export/import
    workerCount: 2,       // Use 2 workers for parallel decryption
    maxQueueSize: 10,     // Max pending tasks per worker
  },
};

export const AUDIO_CONFIG = {
  autoPlay: true,
  shufflePlay: false,
  loop: true,
  volume: 0.7,
  fadeInDuration: 2000,
  fadeOutDuration: 1500,
  crossFadeDuration: 1000,
};

export enum PlayMode {
  SEQUENTIAL = 'sequential',
  SHUFFLE = 'shuffle',
  SINGLE_LOOP = 'single_loop',
}

export enum PlayState {
  STOPPED = 'stopped',
  PLAYING = 'playing',
  PAUSED = 'paused',
  LOADING = 'loading',
  ERROR = 'error',
}
