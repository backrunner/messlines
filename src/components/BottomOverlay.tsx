import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { MUSIC_PLATFORM_LINKS, BRAND_CONFIG } from '../constants/links';

// Music platform icon component
const MusicPlatformIcon = ({ platform }: { platform: (typeof MUSIC_PLATFORM_LINKS)[0] }) => {
  const getIconName = (iconName: string) => {
    switch (iconName) {
      case 'youtube-music':
        return 'simple-icons:youtubemusic';
      case 'spotify':
        return 'simple-icons:spotify';
      case 'soundcloud':
        return 'simple-icons:soundcloud';
      default:
        return 'mdi:music';
    }
  };

  const handleClick = () => {
    window.open(platform.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button onClick={handleClick} className="music-platform-button" aria-label={`Open ${platform.name}`} title={platform.name}>
      <Icon icon={getIconName(platform.icon)} width="20" height="20" />
    </button>
  );
};

const BottomOverlay = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show component after 3 seconds
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`bottom-overlay ${isVisible ? 'visible' : ''}`} role="complementary" aria-label="MessLines brand and music platform links">
      {/* Brand text in bottom left */}
      <div className="brand-section">
        <h1 className="brand-name">{BRAND_CONFIG.name}</h1>
      </div>

      {/* Music platform buttons in bottom right */}
      <div className="music-platforms-section">
        {MUSIC_PLATFORM_LINKS.map((platform) => (
          <MusicPlatformIcon key={platform.name} platform={platform} />
        ))}
      </div>

      <style>{`
        .bottom-overlay {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 2rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          pointer-events: none;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          z-index: 1000;
          user-select: none;
        }

        .bottom-overlay.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .brand-section {
          pointer-events: auto;
        }

        .brand-name {
          font-size: 2rem;
          font-weight: 900;
          font-family: 'Arial Black', sans-serif;
          background: linear-gradient(135deg, #ffffff 0%, #cccccc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          opacity: 0.65;
          margin: 0;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
          user-select: none;
        }

        .music-platforms-section {
          display: flex;
          gap: 1rem;
          pointer-events: auto;
        }

        .music-platform-button {
          width: 48px;
          height: 48px;
          border: none;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          position: relative;
          overflow: hidden;
        }

        .music-platform-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.2);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .music-platform-button:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.1);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .music-platform-button:hover::before {
          opacity: 1;
        }

        .music-platform-button:active {
          transform: scale(0.95);
        }

        .music-platform-button svg {
          width: 20px;
          height: 20px;
          transition: transform 0.3s ease;
        }

        .music-platform-button:hover svg {
          transform: scale(1.1);
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .bottom-overlay {
            padding: 1.5rem;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }

          .brand-name {
            font-size: 2rem;
          }

          .music-platforms-section {
            order: -1;
          }
        }

        @media (max-width: 480px) {
          .bottom-overlay {
            padding: 1rem;
          }

          .brand-name {
            font-size: 1.8rem;
          }

          .music-platform-button {
            width: 44px;
            height: 44px;
          }

          .music-platform-button svg {
            width: 18px;
            height: 18px;
          }
        }

        /* Dark mode adaptation */
        @media (prefers-color-scheme: dark) {
          .brand-name {
            background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }


        }

        /* High contrast mode support */
        @media (prefers-contrast: high) {
          .brand-name {
            -webkit-text-fill-color: #ffffff;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
          }

          .music-platform-button {
            background: rgba(255, 255, 255, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.5);
          }
        }

        /* Reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .bottom-overlay,
          .music-platform-button,
          .music-platform-button svg {
            transition: none;
          }

          .bottom-overlay.visible {
            opacity: 1;
            transform: none;
          }

          .music-platform-button:hover {
            transform: none;
          }

          .music-platform-button:hover svg {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
};

export default BottomOverlay;
