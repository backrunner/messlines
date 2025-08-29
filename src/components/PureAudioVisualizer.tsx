import { useEffect, useRef } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';
import PureLineBallAnimation from './PureLineBallAnimation';
import BackgroundNumbersManager from './BackgroundNumbersManager';

interface PureAudioVisualizerProps {
  currentTrack?: AudioTrack | null;
  currentTrackIndex?: number;
  playState?: PlayState;
  isAnimationPaused?: boolean;
  audioReactiveCallbacks?: React.MutableRefObject<{
    onTransient: (intensity: number, frequency: 'low' | 'mid' | 'high') => void;
    onBeat: (strength: number) => void;
  }>;
}

const PureAudioVisualizer = ({ currentTrack, currentTrackIndex = 0, playState = PlayState.STOPPED, isAnimationPaused = false, audioReactiveCallbacks }: PureAudioVisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const backgroundContainerRef = useRef<HTMLDivElement>(null);
  const lineAnimationRef = useRef<PureLineBallAnimation | null>(null);
  const backgroundNumbersManagerRef = useRef<BackgroundNumbersManager | null>(null);

  // 初始化纯JavaScript动画系统
  useEffect(() => {
    if (!containerRef.current || !backgroundContainerRef.current) return;

    // 初始化线条动画
    lineAnimationRef.current = new PureLineBallAnimation(containerRef.current);

    // 初始化背景数字管理器
    backgroundNumbersManagerRef.current = new BackgroundNumbersManager(backgroundContainerRef.current);

    return () => {
      // 清理资源
      if (lineAnimationRef.current) {
        lineAnimationRef.current.destroy();
        lineAnimationRef.current = null;
      }
      if (backgroundNumbersManagerRef.current) {
        backgroundNumbersManagerRef.current.destroy();
        backgroundNumbersManagerRef.current = null;
      }
    };
  }, []);

  // 处理播放状态变化
  useEffect(() => {
    if (lineAnimationRef.current) {
      if (isAnimationPaused) {
        lineAnimationRef.current.pause();
      } else {
        lineAnimationRef.current.resume();
      }
    }

    if (backgroundNumbersManagerRef.current) {
      backgroundNumbersManagerRef.current.setPlayState(playState === PlayState.PLAYING);
    }
  }, [playState, isAnimationPaused]);

  // 处理音轨变化
  useEffect(() => {
    if (backgroundNumbersManagerRef.current) {
      backgroundNumbersManagerRef.current.setCurrentTrack(currentTrack, currentTrackIndex);
    }
  }, [currentTrack, currentTrackIndex]);

  // 设置音频反应回调
  useEffect(() => {
    if (audioReactiveCallbacks && backgroundNumbersManagerRef.current) {
      audioReactiveCallbacks.current.onTransient = (intensity: number, frequency: 'low' | 'mid' | 'high') => {
        backgroundNumbersManagerRef.current?.handleTransient(intensity, frequency);
      };

      audioReactiveCallbacks.current.onBeat = (strength: number) => {
        backgroundNumbersManagerRef.current?.handleBeat(strength);
      };
    }
  }, [audioReactiveCallbacks]);

  // 处理窗口大小变化
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null;

    const handleResize = () => {
      // 防抖处理，避免频繁触发resize
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        // 通知背景数字管理器调整大小
        if (backgroundNumbersManagerRef.current) {
          backgroundNumbersManagerRef.current.handleResize();
        }
      }, 150); // 150ms延迟防抖
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'linear-gradient(to top, #0a0a0a 40%, #000000)', // 初始背景，会被动画更新
        overflow: 'hidden',
      }}
    >
      {/* 背景数字容器 */}
      <div ref={backgroundContainerRef} />

      {/* 线条动画容器 */}
      <div ref={containerRef} />
    </div>
  );
};

export default PureAudioVisualizer;
