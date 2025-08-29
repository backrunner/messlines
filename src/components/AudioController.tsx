import React, { useState, useCallback, useRef } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';
import AudioManager from './AudioManager';
import PureAudioVisualizer from './PureAudioVisualizer';
import UserInteractionController from './UserInteractionController';
import PauseIndicator from './PauseIndicator';
import PureAudioAnalyzer from './PureAudioAnalyzer';

interface AudioControls {
  togglePlayPause: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  getCurrentTrack: () => AudioTrack | null;
  getPlayState: () => PlayState;
}

const AudioController = () => {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  const [audioControls, setAudioControls] = useState<AudioControls | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // 音频反应回调的引用 - 使用稳定的引用对象
  const audioReactiveCallbacks = useRef({
    onTransient: (intensity: number, frequency: 'low' | 'mid' | 'high') => {},
    onBeat: (strength: number) => {},
  });

  // 纯JavaScript音频分析器实例
  const audioAnalyzerRef = useRef<PureAudioAnalyzer | null>(null);

  // 处理音轨变化
  const handleTrackChange = useCallback((track: AudioTrack, trackIndex: number) => {
    setCurrentTrack(track);
    setCurrentTrackIndex(trackIndex);
  }, []);

  // 处理播放状态变化
  const handlePlayStateChange = useCallback((state: PlayState) => {
    setPlayState(state);

    // 更新纯JavaScript音频分析器的播放状态
    if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.setPlayState(state);
    }
  }, []);

  // 处理音频控制器就绪
  const handleControlsReady = useCallback((controls: AudioControls) => {
    setAudioControls(controls);
  }, []);

  // 处理音频元素就绪
  const handleAudioElementReady = useCallback((element: HTMLAudioElement | null) => {
    setAudioElement(element);

    // 初始化纯JavaScript音频分析器
    if (element && !audioAnalyzerRef.current) {
      audioAnalyzerRef.current = new PureAudioAnalyzer({
        onTransientDetected: (intensity: number, frequency: 'low' | 'mid' | 'high') => {
          audioReactiveCallbacks.current.onTransient(intensity, frequency);
        },
        onBeatDetected: (strength: number) => {
          audioReactiveCallbacks.current.onBeat(strength);
        },
      });
      audioAnalyzerRef.current.setAudioElement(element);
    } else if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.setAudioElement(element);
    }
  }, []);

  // 清理音频分析器资源
  const cleanupAudioAnalyzer = useCallback(() => {
    if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.destroy();
      audioAnalyzerRef.current = null;
    }
  }, []);

  // 计算动画是否应该暂停
  const isAnimationPaused = playState === PlayState.PAUSED;

  // 组件清理
  React.useEffect(() => {
    return () => {
      cleanupAudioAnalyzer();
    };
  }, [cleanupAudioAnalyzer]);

  return (
    <>
      {/* 音频管理器 - 处理所有音频播放逻辑 */}
      <AudioManager onTrackChange={handleTrackChange} onPlayStateChange={handlePlayStateChange} onControlsReady={handleControlsReady} onAudioElementReady={handleAudioElementReady} />

      {/* 用户交互控制器 - 处理键盘和触摸事件 */}
      {audioControls && <UserInteractionController playState={playState} onTogglePlayPause={audioControls.togglePlayPause} onNextTrack={audioControls.nextTrack} onPrevTrack={audioControls.prevTrack} />}

      {/* 暂停指示器 - 左上角显示暂停图标 */}
      <PauseIndicator playState={playState} />

      {/* 纯JavaScript音频可视化器 - 高性能，无React重新渲染 */}
      <PureAudioVisualizer currentTrack={currentTrack} currentTrackIndex={currentTrackIndex} playState={playState} isAnimationPaused={isAnimationPaused} audioReactiveCallbacks={audioReactiveCallbacks} />
    </>
  );
};

export default AudioController;
