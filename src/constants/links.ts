// Music platform link configuration
export interface MusicPlatformLink {
  name: string;
  url: string;
  icon: string;
}

// MessLines music platform links
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

// MessLines brand information
export const BRAND_CONFIG = {
  name: 'MessLines'
};
