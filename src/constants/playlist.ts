export interface AudioTrack {
  id: number;
  title: string;
  audioKey: string;
  duration?: number;
  artist?: string;
}

export const AUDIO_PLAYLIST: AudioTrack[] = [
  {
    id: 0,
    title: "Guide Line",
    audioKey: "audio/guide_line.mp3",
    artist: "MessLines"
  },
];

export const SECSTREAM_CONFIG = {
  sliceDurationMs: 5000,
  compressionLevel: 6,
  bufferSize: 5,
  prefetchSize: 3,
  maxFileSize: 100 * 1024 * 1024,
  sessionTimeout: 60 * 60 * 1000,
  allowedFormats: ['audio/wav', 'audio/mp3', 'audio/flac', 'audio/ogg', 'audio/mpeg'],
};

export const AUDIO_CONFIG = {
  autoPlay: true,
  shufflePlay: true,
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
