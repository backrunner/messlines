import { useState, useCallback } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';
import AudioManager from './AudioManager';
import LineBallAnimation from './LineBallAnimation';

const AudioController = () => {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);

  // 处理音轨变化
  const handleTrackChange = useCallback((track: AudioTrack, trackIndex: number) => {
    setCurrentTrack(track);
    setCurrentTrackIndex(trackIndex);
  }, []);

  // 处理播放状态变化
  const handlePlayStateChange = useCallback((state: PlayState) => {
    setPlayState(state);
  }, []);

  return (
    <>
      {/* 音频管理器 - 处理所有音频播放逻辑 */}
      <AudioManager
        onTrackChange={handleTrackChange}
        onPlayStateChange={handlePlayStateChange}
      />
      
      {/* 线条球动画 - 背景数字会显示当前音轨序号 */}
      <LineBallAnimation
        currentTrack={currentTrack}
        currentTrackIndex={currentTrackIndex}
        playState={playState}
      />
    </>
  );
};

export default AudioController;
