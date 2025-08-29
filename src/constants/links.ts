// 音乐平台跳转链接配置
export interface MusicPlatformLink {
  name: string;
  url: string;
  icon: string; // 图标名称
}

// MessLines 音乐平台链接配置
export const MUSIC_PLATFORM_LINKS: MusicPlatformLink[] = [
  {
    name: 'iTunes',
    url: 'https://music.apple.com',
    icon: 'itunes'
  },
  {
    name: 'Spotify',
    url: 'https://open.spotify.com',
    icon: 'spotify'
  },
  {
    name: 'SoundCloud',
    url: 'https://soundcloud.com',
    icon: 'soundcloud'
  }
];

// MessLines 品牌信息
export const BRAND_CONFIG = {
  name: 'MessLines'
};
