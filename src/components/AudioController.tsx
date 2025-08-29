import { useState, useCallback, useRef } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';
import AudioManager from './AudioManager';
import LineBallAnimation from './LineBallAnimation';
import UserInteractionController from './UserInteractionController';
import PauseIndicator from './PauseIndicator';
import AudioAnalyzer from './AudioAnalyzer';

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
  
  // 音频反应回调的引用
  const audioReactiveRef = useRef<{
    onTransient: (intensity: number, frequency: 'low' | 'mid' | 'high') => void;
    onBeat: (strength: number) => void;
  }>({
    onTransient: () => {},
    onBeat: () => {},
  });

  // 处理音轨变化
  const handleTrackChange = useCallback((track: AudioTrack, trackIndex: number) => {
    setCurrentTrack(track);
    setCurrentTrackIndex(trackIndex);
  }, []);

  // 处理播放状态变化
  const handlePlayStateChange = useCallback((state: PlayState) => {
    setPlayState(state);
  }, []);

  // 处理音频控制器就绪
  const handleControlsReady = useCallback((controls: AudioControls) => {
    setAudioControls(controls);
  }, []);

  // 处理音频元素就绪
  const handleAudioElementReady = useCallback((element: HTMLAudioElement | null) => {
    setAudioElement(element);
  }, []);

  // 音频瞬态检测回调
  const handleTransientDetected = useCallback((intensity: number, frequency: 'low' | 'mid' | 'high') => {
    audioReactiveRef.current.onTransient(intensity, frequency);
  }, []);

  // 音频节拍检测回调
  const handleBeatDetected = useCallback((strength: number) => {
    audioReactiveRef.current.onBeat(strength);
  }, []);

  // 计算动画是否应该暂停
  const isAnimationPaused = playState === PlayState.PAUSED;

  return (
    <>
      {/* 音频管理器 - 处理所有音频播放逻辑 */}
      <AudioManager
        onTrackChange={handleTrackChange}
        onPlayStateChange={handlePlayStateChange}
        onControlsReady={handleControlsReady}
        onAudioElementReady={handleAudioElementReady}
      />
      
      {/* 音频分析器 - 实时分析音频并触发视觉效果 */}
      <AudioAnalyzer
        audioElement={audioElement}
        playState={playState}
        onTransientDetected={handleTransientDetected}
        onBeatDetected={handleBeatDetected}
      />
      
      {/* 用户交互控制器 - 处理键盘和触摸事件 */}
      {audioControls && (
        <UserInteractionController
          playState={playState}
          onTogglePlayPause={audioControls.togglePlayPause}
          onNextTrack={audioControls.nextTrack}
          onPrevTrack={audioControls.prevTrack}
        />
      )}
      
      {/* 暂停指示器 - 左上角显示暂停图标 */}
      <PauseIndicator playState={playState} />
      
      {/* 线条球动画 - 背景数字会显示当前音轨序号并响应音频 */}
      <LineBallAnimation
        currentTrack={currentTrack}
        currentTrackIndex={currentTrackIndex}
        playState={playState}
        isAnimationPaused={isAnimationPaused}
        onAudioReactive={audioReactiveRef.current}
      />
    </>
  );
};

export default AudioController;
