import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { MUSIC_PLATFORM_LINKS, BRAND_CONFIG } from '../constants/links';
import type { AudioTrack } from '../constants/playlist';

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

interface BottomOverlayProps {
  currentTrack?: AudioTrack | null;
}

const BottomOverlay = ({ currentTrack }: BottomOverlayProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showTrackInfo, setShowTrackInfo] = useState(false);
  const [trackSlotA, setTrackSlotA] = useState<AudioTrack | null>(null);
  const [trackSlotB, setTrackSlotB] = useState<AudioTrack | null>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [coverLoadedA, setCoverLoadedA] = useState(false);
  const [coverLoadedB, setCoverLoadedB] = useState(false);

  useEffect(() => {
    // Show component after 3 seconds
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Show track info when we have a track with a cover
    if (currentTrack?.coverKey) {
      // Delay slightly to allow for smooth transition
      const timer = setTimeout(() => {
        setShowTrackInfo(true);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setShowTrackInfo(false);
    }
  }, [currentTrack]);

  useEffect(() => {
    // Handle track changes - toggle between slots
    if (currentTrack && currentTrack.coverKey) {
      const currentActiveTrack = activeSlot === 'A' ? trackSlotA : trackSlotB;

      // Only switch slots if the track actually changed
      if (!currentActiveTrack || currentTrack.title !== currentActiveTrack.title) {
        if (activeSlot === 'A') {
          // Switch to slot B immediately, reset its load state
          setCoverLoadedB(false);
          setTrackSlotB(currentTrack);
          setActiveSlot('B');
        } else {
          // Switch to slot A immediately, reset its load state
          setCoverLoadedA(false);
          setTrackSlotA(currentTrack);
          setActiveSlot('A');
        }
      }
    }
  }, [currentTrack, activeSlot, trackSlotA, trackSlotB]);

  const coverUrlA = trackSlotA?.coverKey
    ? `/api/covers/${trackSlotA.coverKey.split('/').pop()}`
    : null;

  const coverUrlB = trackSlotB?.coverKey
    ? `/api/covers/${trackSlotB.coverKey.split('/').pop()}`
    : null;

  return (
    <div className={`bottom-overlay ${isVisible ? 'visible' : ''}`} role="complementary" aria-label="MessLines brand and music platform links">
      {/* Brand and track info section in bottom left */}
      <div className="brand-section">
        <div className={`track-info-container ${showTrackInfo ? 'show-track' : ''}`}>
          {/* Cover - two slots, always rendered */}
          <div className="cover-wrapper">
            {/* Slot A */}
            {coverUrlA && (
              <img
                ref={(img) => {
                  if (img && img.complete && img.naturalHeight !== 0) {
                    setCoverLoadedA(true);
                  }
                }}
                src={coverUrlA}
                alt={`${trackSlotA?.title} cover`}
                className={`cover-image cover-slot-a ${activeSlot === 'A' ? 'active' : 'inactive'} ${coverLoadedA ? 'loaded' : ''}`}
                onLoad={() => setCoverLoadedA(true)}
                loading="eager"
              />
            )}
            {/* Slot B */}
            {coverUrlB && (
              <img
                ref={(img) => {
                  if (img && img.complete && img.naturalHeight !== 0) {
                    setCoverLoadedB(true);
                  }
                }}
                src={coverUrlB}
                alt={`${trackSlotB?.title} cover`}
                className={`cover-image cover-slot-b ${activeSlot === 'B' ? 'active' : 'inactive'} ${coverLoadedB ? 'loaded' : ''}`}
                onLoad={() => setCoverLoadedB(true)}
                loading="eager"
              />
            )}
          </div>
          {/* Track title - two slots, always rendered */}
          <div className="track-title-wrapper">
            {/* Slot A */}
            {trackSlotA && coverUrlA && (
              <div className={`track-title title-slot-a ${activeSlot === 'A' && showTrackInfo ? 'active' : 'inactive'}`}>
                {trackSlotA.title}
              </div>
            )}
            {/* Slot B */}
            {trackSlotB && coverUrlB && (
              <div className={`track-title title-slot-b ${activeSlot === 'B' && showTrackInfo ? 'active' : 'inactive'}`}>
                {trackSlotB.title}
              </div>
            )}
          </div>
          {/* Brand name */}
          <div className="brand-name-wrapper">
            <h1 className="brand-name">{BRAND_CONFIG.name}</h1>
          </div>
        </div>
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
          padding-bottom: calc(2rem + env(safe-area-inset-bottom));
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

        .track-info-container {
          position: relative;
          width: auto;
          height: 80px;
          transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .cover-wrapper {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 80px;
          height: 80px;
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.2s ease,
                      transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s;
          pointer-events: none;
        }

        .track-info-container.show-track .cover-wrapper {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
          transition: opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s,
                      transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s;
        }

        .cover-image {
          width: 80px;
          height: 80px;
          border-radius: 12px;
          object-fit: cover;
          box-shadow:
            4px 4px 12px rgba(0, 0, 0, 0.5),
            8px 8px 24px rgba(0, 0, 0, 0.4),
            12px 12px 40px rgba(0, 0, 0, 0.3);
          display: block;
          position: absolute;
          top: 0;
          left: 0;
          transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: opacity;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
        }

        .cover-slot-a, .cover-slot-b {
          opacity: 0;
          pointer-events: none;
          z-index: 1;
        }

        /* Active slot but not loaded yet - stay transparent */
        .cover-slot-a.active, .cover-slot-b.active {
          opacity: 0;
          pointer-events: auto;
          z-index: 2;
        }

        /* Active AND loaded - show it */
        .cover-slot-a.active.loaded, .cover-slot-b.active.loaded {
          opacity: 1;
        }

        /* Inactive - always transparent, even if loaded */
        .cover-slot-a.inactive, .cover-slot-b.inactive {
          opacity: 0;
          pointer-events: none;
          z-index: 1;
        }

        .track-title-wrapper {
          position: absolute;
          left: 0;
          bottom: 1.675rem;
          height: auto;
          transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .track-info-container.show-track .track-title-wrapper {
          left: 96px;
        }

        .track-title {
          font-size: 1.25rem;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          color: rgba(255, 255, 255, 0.9);
          text-shadow:
            2px 2px 4px rgba(0, 0, 0, 0.6),
            4px 4px 12px rgba(0, 0, 0, 0.4),
            1px 1px 2px rgba(0, 0, 0, 0.8);
          letter-spacing: -0.02em;
          white-space: nowrap;
          line-height: 1.25rem;
          transition: opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .title-slot-a, .title-slot-b {
          opacity: 0;
          position: absolute;
          bottom: 0;
          left: 0;
        }

        .title-slot-a.active, .title-slot-b.active {
          opacity: 1;
        }

        .title-slot-a.inactive, .title-slot-b.inactive {
          opacity: 0;
        }

        .brand-name-wrapper {
          position: absolute;
          left: 0;
          bottom: 0;
          transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .track-info-container.show-track .brand-name-wrapper {
          left: 96px;
        }

        .brand-name {
          font-size: 2rem;
          font-weight: 900;
          font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #ffffff 0%, #cccccc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          opacity: 0.65;
          margin: 0;
          letter-spacing: -0.02em;
          filter: drop-shadow(2px 2px 4px rgba(0, 0, 0, 0.5))
                  drop-shadow(4px 4px 12px rgba(0, 0, 0, 0.3));
          user-select: none;
          transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          white-space: nowrap;
          line-height: 1;
        }

        .track-info-container.show-track .brand-name {
          font-size: 1.2rem;
          font-weight: 600;
          opacity: 0.5;
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
          box-shadow:
            4px 4px 12px rgba(0, 0, 0, 0.4),
            2px 2px 6px rgba(0, 0, 0, 0.3),
            1px 1px 3px rgba(0, 0, 0, 0.5);
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
          box-shadow:
            8px 8px 25px rgba(0, 0, 0, 0.5),
            4px 4px 15px rgba(0, 0, 0, 0.4),
            2px 2px 8px rgba(0, 0, 0, 0.6);
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
          /* Override desktop transitions and transforms */
          .cover-wrapper,
          .track-info-container.show-track .cover-wrapper {
            transition: opacity 0.3s ease, transform 0.3s ease !important;
          }

          .cover-image {
            transition: opacity 0.3s ease !important;
            will-change: opacity !important;
          }

          .bottom-overlay {
            padding: 1.5rem 1.5rem calc(1rem + env(safe-area-inset-bottom, 0px));
            flex-direction: column;
            align-items: center;
            justify-content: flex-end;
            gap: 0.875rem;
          }

          .brand-section {
            display: flex;
            justify-content: center;
            width: 100%;
          }

          .track-info-container {
            height: auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 0.875rem;
          }

          .cover-wrapper {
            width: 64px;
            height: 64px;
            position: relative;
            left: auto;
            bottom: auto;
            opacity: 0;
            transform: translateY(10px);
            overflow: hidden;
            flex-shrink: 0;
            border-radius: 12px;
          }

          .track-info-container.show-track .cover-wrapper {
            opacity: 1;
            transform: translateY(0);
          }

          .cover-image {
            width: 64px;
            height: 64px;
            display: block;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            object-fit: cover;
            border-radius: 12px;
          }

          .track-title-wrapper {
            position: relative;
            left: auto;
            bottom: auto;
            transform: none;
            text-align: center;
            width: 100%;
            height: 1rem;
          }

          .track-info-container.show-track .track-title-wrapper {
            left: auto;
            transform: none;
          }

          .title-slot-a, .title-slot-b {
            position: absolute;
            left: 0;
            bottom: 0;
            width: 100%;
            text-align: center;
          }

          .track-title {
            font-size: 1rem;
            line-height: 1rem;
          }

          .brand-name-wrapper {
            position: relative;
            left: auto;
            bottom: auto;
            transform: none;
            text-align: center;
            transition: opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }

          .track-info-container.show-track .brand-name-wrapper {
            left: auto;
            transform: none;
            opacity: 0;
            pointer-events: none;
          }

          .brand-name {
            font-size: 1.6rem;
          }

          .track-info-container.show-track .brand-name {
            font-size: 1.6rem;
          }

          .music-platforms-section {
            order: -1;
            gap: 0.75rem;
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

        @media (max-width: 480px) {
          .bottom-overlay {
            padding: 1rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
            gap: 0.875rem;
          }

          .track-info-container {
            gap: 0.875rem;
          }

          .track-title-wrapper {
            height: 0.9rem;
          }

          .cover-wrapper {
            width: 56px;
            height: 56px;
          }

          .cover-image {
            width: 56px;
            height: 56px;
            border-radius: 10px;
          }

          .track-title {
            font-size: 0.9rem;
            line-height: 0.9rem;
          }

          .brand-name {
            font-size: 1.4rem;
          }

          .track-info-container.show-track .brand-name {
            font-size: 1.4rem;
          }

          .music-platforms-section {
            gap: 0.5rem;
          }

          .music-platform-button {
            width: 40px;
            height: 40px;
          }

          .music-platform-button svg {
            width: 16px;
            height: 16px;
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
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
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
          .music-platform-button svg,
          .cover-wrapper,
          .cover-image,
          .track-title,
          .brand-name-wrapper {
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

          .track-info-container.show-track .cover-wrapper {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
};

export default BottomOverlay;
