import { useState, useCallback } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';
import AudioManager from './AudioManager';
import LineBallAnimation from './LineBallAnimation';
import UserInteractionController from './UserInteractionController';
import PauseIndicator from './PauseIndicator';

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

  // 计算动画是否应该暂停
  const isAnimationPaused = playState === PlayState.PAUSED;

  return (
    <>
      {/* 音频管理器 - 处理所有音频播放逻辑 */}
      <AudioManager
        onTrackChange={handleTrackChange}
        onPlayStateChange={handlePlayStateChange}
        onControlsReady={handleControlsReady}
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
      
      {/* 线条球动画 - 背景数字会显示当前音轨序号 */}
      <LineBallAnimation
        currentTrack={currentTrack}
        currentTrackIndex={currentTrackIndex}
        playState={playState}
        isAnimationPaused={isAnimationPaused}
      />
    </>
  );
};

export default AudioController;
