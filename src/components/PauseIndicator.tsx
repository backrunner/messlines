import { Icon } from '@iconify/react';
import { PlayState } from '../constants/playlist';

interface PauseIndicatorProps {
  playState: PlayState;
}

const PauseIndicator = ({ playState }: PauseIndicatorProps) => {
  const isPaused = playState === PlayState.PAUSED;

  return (
    <div
      className={`pause-indicator ${isPaused ? 'visible' : ''}`}
      role="status"
      aria-label={isPaused ? '音乐已暂停' : ''}
    >
      <Icon icon="mdi:pause" width="24" height="24" />
      
      <style>{`
        .pause-indicator {
          position: fixed;
          top: 2rem;
          left: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-radius: 50%;
          color: #ffffff;
          opacity: 0;
          transform: scale(0.8) translateY(-10px);
          transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          pointer-events: none;
          z-index: 1000;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .pause-indicator.visible {
          opacity: 1;
          transform: scale(1) translateY(0);
        }

        .pause-indicator::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 50%;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .pause-indicator.visible::before {
          opacity: 1;
        }

        /* 呼吸效果 */
        .pause-indicator.visible {
          animation: pauseBreathing 2s ease-in-out infinite alternate;
        }

        @keyframes pauseBreathing {
          from {
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 0 rgba(255, 255, 255, 0.1);
          }
          to {
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 8px rgba(255, 255, 255, 0.02);
          }
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
          .pause-indicator {
            top: 1.5rem;
            left: 1.5rem;
            width: 44px;
            height: 44px;
          }

          .pause-indicator svg {
            width: 20px;
            height: 20px;
          }
        }

        @media (max-width: 480px) {
          .pause-indicator {
            top: 1rem;
            left: 1rem;
            width: 40px;
            height: 40px;
          }

          .pause-indicator svg {
            width: 18px;
            height: 18px;
          }
        }

        /* 减少动画偏好 */
        @media (prefers-reduced-motion: reduce) {
          .pause-indicator,
          .pause-indicator::before {
            transition: none;
          }

          .pause-indicator.visible {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }

        /* 高对比度模式支持 */
        @media (prefers-contrast: high) {
          .pause-indicator {
            background: rgba(255, 255, 255, 0.3);
            border: 2px solid rgba(255, 255, 255, 0.8);
          }
        }
      `}</style>
    </div>
  );
};

export default PauseIndicator;
