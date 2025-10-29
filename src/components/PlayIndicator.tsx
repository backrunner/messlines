import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { PlayState } from '../constants/playlist';

interface PlayIndicatorProps {
  playState: PlayState;
  onPlay: () => void;
  shouldFadeOut?: boolean;
}

const PlayIndicator = ({ playState, onPlay, shouldFadeOut }: PlayIndicatorProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Fade in when mounted
  useEffect(() => {
    // Small delay to ensure CSS transition works
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 10);
    return () => clearTimeout(timer);
  }, []);

  // Handle external fade-out trigger
  useEffect(() => {
    if (shouldFadeOut) {
      setIsFadingOut(true);
    }
  }, [shouldFadeOut]);

  const handleClick = () => {
    // Start fade out animation
    setIsFadingOut(true);

    // Wait for fade out animation to complete before calling onPlay
    setTimeout(() => {
      onPlay();
    }, 400); // Match the CSS transition duration
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={`play-indicator ${isVisible && !isFadingOut ? 'visible' : ''} ${isFadingOut ? 'fading-out' : ''}`}
      role="button"
      aria-label="Click to start playing music"
      onClick={handleClick}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <Icon icon="mdi:play" width="28" height="28" />

      <style>{`
        .play-indicator {
          position: fixed;
          top: calc(2rem + env(safe-area-inset-top));
          right: calc(2rem + env(safe-area-inset-right));
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 50%;
          color: #ffffff;
          opacity: 0;
          transform: scale(0.8) translateY(-10px);
          transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          pointer-events: none;
          z-index: 1000;
          border: 1px solid rgba(255, 255, 255, 0.25);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          cursor: pointer;
        }

        /* Fade in animation */
        .play-indicator.visible {
          opacity: 1;
          transform: scale(1) translateY(0);
          pointer-events: auto;
        }

        /* Fade out animation */
        .play-indicator.fading-out {
          opacity: 0;
          transform: scale(0.8) translateY(-10px);
          pointer-events: none;
        }

        .play-indicator:hover {
          background: rgba(255, 255, 255, 0.18);
          transform: scale(1.05) translateY(0);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
        }

        .play-indicator:active {
          transform: scale(0.95) translateY(0);
        }

        .play-indicator::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 50%;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .play-indicator.visible::before {
          opacity: 1;
        }

        /* Breathing effect */
        .play-indicator.visible:not(.fading-out) {
          animation: playBreathing 3s ease-in-out infinite alternate;
        }

        @keyframes playBreathing {
          from {
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 0 rgba(255, 255, 255, 0.1);
          }
          to {
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 12px rgba(255, 255, 255, 0.03);
          }
        }

        /* Pulse effect */
        .play-indicator.visible:not(.fading-out)::after {
          content: '';
          position: absolute;
          top: -4px;
          left: -4px;
          right: -4px;
          bottom: -4px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          animation: playPulse 2s ease-in-out infinite;
        }

        @keyframes playPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0;
          }
        }

        /* Focus styles */
        .play-indicator:focus {
          outline: 2px solid rgba(255, 255, 255, 0.5);
          outline-offset: 2px;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .play-indicator {
            top: 1.5rem;
            right: 1.5rem;
            width: 52px;
            height: 52px;
          }

          .play-indicator svg {
            width: 24px;
            height: 24px;
          }
        }

        @media (max-width: 480px) {
          .play-indicator {
            top: 1rem;
            right: 1rem;
            width: 48px;
            height: 48px;
          }

          .play-indicator svg {
            width: 22px;
            height: 22px;
          }
        }

        /* Reduced motion preferences */
        @media (prefers-reduced-motion: reduce) {
          .play-indicator,
          .play-indicator::before,
          .play-indicator::after {
            transition: none;
            animation: none;
          }

          .play-indicator.visible {
            opacity: 1;
            transform: none;
          }

          .play-indicator.fading-out {
            opacity: 0;
          }

          .play-indicator:hover {
            transform: none;
          }
        }

        /* High contrast mode support */
        @media (prefers-contrast: high) {
          .play-indicator {
            background: rgba(255, 255, 255, 0.4);
            border: 2px solid rgba(255, 255, 255, 0.9);
          }

          .play-indicator:hover {
            background: rgba(255, 255, 255, 0.6);
          }
        }

        /* Touch device optimization */
        @media (hover: none) and (pointer: coarse) {
          .play-indicator:hover {
            background: rgba(255, 255, 255, 0.12);
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default PlayIndicator;
