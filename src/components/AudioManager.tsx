import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AUDIO_PLAYLIST, AUDIO_CONFIG, PlayMode, PlayState } from '../constants/playlist';
import type { AudioTrack } from '../constants/playlist';

interface AudioManagerProps {
  onTrackChange?: (track: AudioTrack, trackIndex: number) => void;
  onPlayStateChange?: (state: PlayState) => void;
  onControlsReady?: (controls: AudioControls) => void;
  onAudioElementReady?: (audioElement: HTMLAudioElement | null) => void;
  onAutoplayBlocked?: (blocked: boolean) => void; // 新增：自动播放被阻止的回调
}

interface AudioControls {
  togglePlayPause: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  getCurrentTrack: () => AudioTrack | null;
  getPlayState: () => PlayState;
}

// Fisher-Yates 洗牌算法
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const AudioManager = ({ onTrackChange, onPlayStateChange, onControlsReady, onAudioElementReady, onAutoplayBlocked }: AudioManagerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  const [playMode, setPlayMode] = useState<PlayMode>(PlayMode.SHUFFLE);
  const [shuffledPlaylist, setShuffledPlaylist] = useState<AudioTrack[]>([]);
  const [playedTracks, setPlayedTracks] = useState<Set<number>>(new Set());
  const [volume, setVolume] = useState<number>(AUDIO_CONFIG.volume);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // 初始化播放列表
  useEffect(() => {
    if (AUDIO_PLAYLIST.length === 0) return;
    
    if (AUDIO_CONFIG.shufflePlay) {
      // 创建乱序播放列表
      const shuffled = shuffleArray(AUDIO_PLAYLIST);
      setShuffledPlaylist(shuffled);
      setCurrentTrackIndex(0);
    } else {
      setShuffledPlaylist(AUDIO_PLAYLIST);
      setCurrentTrackIndex(0);
    }
  }, []);

  // 获取当前播放的音轨
  const getCurrentTrack = useCallback((): AudioTrack | null => {
    if (shuffledPlaylist.length === 0) return null;
    return shuffledPlaylist[currentTrackIndex] || null;
  }, [shuffledPlaylist, currentTrackIndex]);

  // 音量淡入淡出
  const fadeVolume = useCallback((fromVolume: number, toVolume: number, duration: number, callback?: () => void) => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const steps = 50;
    const stepDuration = duration / steps;
    const volumeStep = (toVolume - fromVolume) / steps;
    let currentStep = 0;

    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }

    audio.volume = fromVolume;

    fadeIntervalRef.current = setInterval(() => {
      if (!audioRef.current) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        return;
      }

      currentStep++;
      const newVolume = fromVolume + (volumeStep * currentStep);
      audioRef.current.volume = Math.max(0, Math.min(1, newVolume));

      if (currentStep >= steps) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        audioRef.current.volume = toVolume;
        callback?.();
      }
    }, stepDuration);
  }, []);

  // 播放指定音轨 - 添加throwOnError参数用于自动播放检测
  const playTrack = useCallback(async (trackIndex: number, throwOnError: boolean = false) => {
    const track = shuffledPlaylist[trackIndex];
    if (!track || !audioRef.current) return;

    try {
      setPlayState(PlayState.LOADING);
      
      const audio = audioRef.current;
      audio.src = track.url;
      audio.volume = 0; // 开始时音量为0，准备淡入
      
      // 等待音频加载
      await new Promise((resolve, reject) => {
        const handleCanPlay = () => {
          audio.removeEventListener('canplay', handleCanPlay);
          audio.removeEventListener('error', handleError);
          resolve(void 0);
        };
        
        const handleError = () => {
          audio.removeEventListener('canplay', handleCanPlay);
          audio.removeEventListener('error', handleError);
          reject(new Error('Failed to load audio'));
        };
        
        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('error', handleError);
        audio.load();
      });

      // 开始播放并淡入
      await audio.play();
      setPlayState(PlayState.PLAYING);
      setCurrentTrackIndex(trackIndex);
      
      // 标记此音轨已播放
      setPlayedTracks(prev => new Set(prev).add(track.id));
      
      // 音量淡入
      fadeVolume(0, volume, AUDIO_CONFIG.fadeInDuration);
      
      // 通知外部组件
      onTrackChange?.(track, trackIndex);
      onPlayStateChange?.(PlayState.PLAYING);
      
    } catch (error) {
      console.error('播放音轨失败:', error);
      setPlayState(PlayState.ERROR);
      onPlayStateChange?.(PlayState.ERROR);
      
      // 如果需要抛出错误（用于自动播放检测），重新抛出
      if (throwOnError) {
        throw error;
      }
    }
  }, [shuffledPlaylist, volume, fadeVolume, onTrackChange, onPlayStateChange]);

  // 播放下一首
  const playNext = useCallback(() => {
    if (shuffledPlaylist.length === 0) return;

    let nextIndex = currentTrackIndex + 1;

    // 如果播放完所有音轨，重新洗牌并重置已播放记录
    if (nextIndex >= shuffledPlaylist.length) {
      if (AUDIO_CONFIG.loop) {
        // 重新洗牌播放列表
        const newShuffled = shuffleArray(AUDIO_PLAYLIST);
        setShuffledPlaylist(newShuffled);
        setPlayedTracks(new Set());
        nextIndex = 0;
      } else {
        // 不循环，停止播放
        setPlayState(PlayState.STOPPED);
        onPlayStateChange?.(PlayState.STOPPED);
        return;
      }
    }

    playTrack(nextIndex);
  }, [shuffledPlaylist, currentTrackIndex, playTrack, onPlayStateChange]);

  // 播放上一首
  const playPrev = useCallback(() => {
    if (shuffledPlaylist.length === 0) return;

    let prevIndex = currentTrackIndex - 1;

    // 如果到了列表开头，跳到最后一首
    if (prevIndex < 0) {
      prevIndex = shuffledPlaylist.length - 1;
    }

    playTrack(prevIndex);
  }, [shuffledPlaylist, currentTrackIndex, playTrack]);

  // 停止播放
  const stop = useCallback(() => {
    if (!audioRef.current) return;
    
    fadeVolume(audioRef.current.volume, 0, AUDIO_CONFIG.fadeOutDuration, () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayState(PlayState.STOPPED);
      onPlayStateChange?.(PlayState.STOPPED);
    });
  }, [fadeVolume, onPlayStateChange]);

  // 暂停/恢复播放
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (playState === PlayState.PLAYING) {
      audioRef.current.pause();
      setPlayState(PlayState.PAUSED);
      onPlayStateChange?.(PlayState.PAUSED);
    } else if (playState === PlayState.PAUSED) {
      audioRef.current.play();
      setPlayState(PlayState.PLAYING);
      onPlayStateChange?.(PlayState.PLAYING);
    }
  }, [playState, onPlayStateChange]);

  // 音频事件处理
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      playNext();
    };

    const handleError = () => {
      console.error('音频播放错误');
      setPlayState(PlayState.ERROR);
      onPlayStateChange?.(PlayState.ERROR);
      // 尝试播放下一首
      setTimeout(() => playNext(), 1000);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [playNext, onPlayStateChange]);

  // 自动开始播放 - 检测自动播放限制
  useEffect(() => {
    if (
      AUDIO_CONFIG.autoPlay && 
      shuffledPlaylist.length > 0 && 
      !isInitializedRef.current &&
      playState === PlayState.STOPPED
    ) {
      isInitializedRef.current = true;
      
      // 延迟3秒尝试自动播放，让动画先播放
      setTimeout(async () => {
        try {
          // 直接尝试播放第一首歌来检测自动播放限制（throwOnError=true）
          await playTrack(0, true);
          
          // 如果到这里说明自动播放成功
          onAutoplayBlocked?.(false);
          
        } catch (error) {
          // 自动播放被阻止
          console.log('自动播放被浏览器阻止，需要用户交互:', error);
          onAutoplayBlocked?.(true);
          setPlayState(PlayState.STOPPED);
          onPlayStateChange?.(PlayState.STOPPED);
        }
      }, 3000);
    }
  }, [shuffledPlaylist, playState, playTrack, onAutoplayBlocked, onPlayStateChange]);

  // 清理资源
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
    };
  }, []);

  // 创建稳定的控制器对象引用
  const controls = useMemo<AudioControls>(() => ({
    togglePlayPause,
    nextTrack: playNext,
    prevTrack: playPrev,
    getCurrentTrack,
    getPlayState: () => playState,
  }), [togglePlayPause, playNext, playPrev, getCurrentTrack, playState]);

  // 将控制器传递给父组件
  useEffect(() => {
    onControlsReady?.(controls);
  }, [onControlsReady, controls]);

  // 将音频元素传递给父组件
  useEffect(() => {
    onAudioElementReady?.(audioRef.current);
  }, [onAudioElementReady]);

  // 导出控制方法给外部使用
  useEffect(() => {
    // 将控制方法挂载到全局，方便调试和外部控制
    if (typeof window !== 'undefined') {
      (window as any).audioManager = {
        play: () => playTrack(currentTrackIndex),
        stop,
        next: playNext,
        prev: playPrev,
        togglePlayPause,
        getCurrentTrack,
        getPlayState: () => playState,
        getPlaylist: () => shuffledPlaylist,
      };
    }
  }, [playTrack, currentTrackIndex, stop, playNext, playPrev, togglePlayPause, getCurrentTrack, playState, shuffledPlaylist]);

  return (
    <audio
      ref={audioRef}
      style={{ display: 'none' }}
      preload="metadata"
    />
  );
};

export default AudioManager;
