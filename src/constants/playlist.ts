// 音频播放列表配置
export interface AudioTrack {
  id: number;
  title: string;
  url: string;
  duration?: number; // 可选：音频时长（秒）
  artist?: string; // 可选：艺术家
}

// MessLines 音频播放列表
export const AUDIO_PLAYLIST: AudioTrack[] = [
  {
    id: 0,
    title: "Guide Line",
    url: "/audios/Guide Line.wav",
    artist: "MessLines"
  },
  // 可以添加更多音频文件
  // {
  //   id: 1,
  //   title: "Another Track",
  //   url: "/audios/another-track.wav",
  //   artist: "MessLines"
  // },
];

// 播放器配置
export const AUDIO_CONFIG = {
  autoPlay: true, // 自动播放
  shufflePlay: true, // 乱序播放
  loop: true, // 循环播放整个列表
  volume: 0.7, // 默认音量 (0-1)
  fadeInDuration: 2000, // 淡入时长（毫秒）
  fadeOutDuration: 1500, // 淡出时长（毫秒）
  crossFadeDuration: 1000, // 交叉淡入淡出时长（毫秒）
};

// 播放模式
export enum PlayMode {
  SEQUENTIAL = 'sequential', // 顺序播放
  SHUFFLE = 'shuffle', // 乱序播放
  SINGLE_LOOP = 'single_loop', // 单曲循环
}

// 播放状态
export enum PlayState {
  STOPPED = 'stopped',
  PLAYING = 'playing',
  PAUSED = 'paused',
  LOADING = 'loading',
  ERROR = 'error',
}
