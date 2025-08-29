// 音乐平台跳转链接配置
export interface MusicPlatformLink {
  name: string;
  url: string;
  icon: string; // 图标名称
}

// MessLines 音乐平台链接配置
export const MUSIC_PLATFORM_LINKS: MusicPlatformLink[] = [
  {
    name: 'YouTube Music',
    url: 'https://music.youtube.com/channel/UCd99CRXWmyWDLdUnvrkZz5Q',
    icon: 'youtube-music'
  },
  {
    name: 'Spotify',
    url: 'https://open.spotify.com/artist/2x8XHsmETlbrVm0ykQlk6p',
    icon: 'spotify'
  },
  {
    name: 'SoundCloud',
    url: 'https://soundcloud.com/messlines',
    icon: 'soundcloud'
  }
];

// MessLines 品牌信息
export const BRAND_CONFIG = {
  name: 'MessLines'
};
