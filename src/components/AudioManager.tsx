import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AUDIO_PLAYLIST, AUDIO_CONFIG, PlayMode, PlayState } from '../constants/playlist';
import type { AudioTrack } from '../constants/playlist';
import { SecStreamService } from '../services/SecStreamService';

interface AudioManagerProps {
  onTrackChange?: (track: AudioTrack, trackIndex: number) => void;
  onPlayStateChange?: (state: PlayState) => void;
  onControlsReady?: (controls: AudioControls) => void;
  onAudioElementReady?: (audioElement: HTMLAudioElement | null) => void;
  onAutoplayBlocked?: (blocked: boolean) => void;
}

interface AudioControls {
  togglePlayPause: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  getCurrentTrack: () => AudioTrack | null;
  getPlayState: () => PlayState;
}

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const AudioManager = ({ onTrackChange, onPlayStateChange, onControlsReady, onAudioElementReady, onAutoplayBlocked }: AudioManagerProps) => {
  const secStreamRef = useRef<SecStreamService | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  const [playMode, setPlayMode] = useState<PlayMode>(PlayMode.SHUFFLE);
  const [shuffledPlaylist, setShuffledPlaylist] = useState<AudioTrack[]>([]);
  const [playedTracks, setPlayedTracks] = useState<Set<number>>(new Set());
  const [volume, setVolume] = useState<number>(AUDIO_CONFIG.volume);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    secStreamRef.current = new SecStreamService();

    return () => {
      if (secStreamRef.current) {
        secStreamRef.current.destroy();
        secStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (AUDIO_PLAYLIST.length === 0) return;

    if (AUDIO_CONFIG.shufflePlay) {
      const shuffled = shuffleArray(AUDIO_PLAYLIST);
      setShuffledPlaylist(shuffled);
      setCurrentTrackIndex(0);
    } else {
      setShuffledPlaylist(AUDIO_PLAYLIST);
      setCurrentTrackIndex(0);
    }
  }, []);

  const getCurrentTrack = useCallback((): AudioTrack | null => {
    if (shuffledPlaylist.length === 0) return null;
    return shuffledPlaylist[currentTrackIndex] || null;
  }, [shuffledPlaylist, currentTrackIndex]);

  const playTrack = useCallback(
    async (trackIndex: number, throwOnError: boolean = false) => {
      const track = shuffledPlaylist[trackIndex];
      if (!track || !secStreamRef.current) return;

      try {
        setPlayState(PlayState.LOADING);

        console.log(`🔐 Playing with SecStream: ${track.title}`);

        await secStreamRef.current.createSecureAudioUrl(track);

        secStreamRef.current.setVolume(volume);

        const handleSecStreamEnded = () => {
          playNext();
        };

        const handleSecStreamError = (event: Event) => {
          console.error('SecStream playback error:', event);
          setPlayState(PlayState.ERROR);
          onPlayStateChange?.(PlayState.ERROR);
        };

        const handleSecStreamTimeUpdate = (event: Event) => {
          const customEvent = event as CustomEvent;
          console.log('Current time:', customEvent.detail?.currentTime);
        };

        secStreamRef.current.addEventListener('ended', handleSecStreamEnded);
        secStreamRef.current.addEventListener('error', handleSecStreamError);
        secStreamRef.current.addEventListener('timeupdate', handleSecStreamTimeUpdate);

        await secStreamRef.current.play();

        setPlayState(PlayState.PLAYING);
        setCurrentTrackIndex(trackIndex);

        setPlayedTracks((prev) => new Set(prev).add(track.id));

        onTrackChange?.(track, trackIndex);
        onPlayStateChange?.(PlayState.PLAYING);

      } catch (error) {
        console.error('SecStream playback failed:', error);

        if (throwOnError) {
          setPlayState(PlayState.STOPPED);
          onPlayStateChange?.(PlayState.STOPPED);
          throw error;
        } else {
          setPlayState(PlayState.ERROR);
          onPlayStateChange?.(PlayState.ERROR);
        }
      }
    },
    [shuffledPlaylist, volume, onTrackChange, onPlayStateChange]
  );

  const playNext = useCallback(() => {
    if (shuffledPlaylist.length === 0) return;

    let nextIndex = currentTrackIndex + 1;

    if (nextIndex >= shuffledPlaylist.length) {
      if (AUDIO_CONFIG.loop) {
        const newShuffled = shuffleArray(AUDIO_PLAYLIST);
        setShuffledPlaylist(newShuffled);
        setPlayedTracks(new Set());
        nextIndex = 0;
      } else {
        setPlayState(PlayState.STOPPED);
        onPlayStateChange?.(PlayState.STOPPED);
        return;
      }
    }

    playTrack(nextIndex);
  }, [shuffledPlaylist, currentTrackIndex, playTrack, onPlayStateChange]);

  const playPrev = useCallback(() => {
    if (shuffledPlaylist.length === 0) return;

    let prevIndex = currentTrackIndex - 1;

    if (prevIndex < 0) {
      prevIndex = shuffledPlaylist.length - 1;
    }

    playTrack(prevIndex);
  }, [shuffledPlaylist, currentTrackIndex, playTrack]);

  const stop = useCallback(() => {
    if (secStreamRef.current) {
      secStreamRef.current.stop();
      setPlayState(PlayState.STOPPED);
      onPlayStateChange?.(PlayState.STOPPED);
    }
  }, [onPlayStateChange]);

  const togglePlayPause = useCallback(() => {
    if (!secStreamRef.current) return;

    if (playState === PlayState.PLAYING) {
      secStreamRef.current.pause();
      setPlayState(PlayState.PAUSED);
      onPlayStateChange?.(PlayState.PAUSED);
    } else if (playState === PlayState.PAUSED) {
      secStreamRef.current.play();
      setPlayState(PlayState.PLAYING);
      onPlayStateChange?.(PlayState.PLAYING);
    } else if (playState === PlayState.STOPPED || playState === PlayState.ERROR) {
      playTrack(currentTrackIndex);
    }
  }, [playState, onPlayStateChange, playTrack, currentTrackIndex]);

  useEffect(() => {
    if (AUDIO_CONFIG.autoPlay && shuffledPlaylist.length > 0 && !isInitializedRef.current && playState === PlayState.STOPPED) {
      isInitializedRef.current = true;

      setTimeout(async () => {
        try {
          await playTrack(0, true);
          onAutoplayBlocked?.(false);
        } catch (error) {
          console.log('Autoplay blocked by browser, user interaction required:', error);
          onAutoplayBlocked?.(true);
          setPlayState(PlayState.STOPPED);
          onPlayStateChange?.(PlayState.STOPPED);
        }
      }, 3000);
    }
  }, [shuffledPlaylist, playState, playTrack, onAutoplayBlocked, onPlayStateChange]);

  const controls = useMemo<AudioControls>(
    () => ({
      togglePlayPause,
      nextTrack: playNext,
      prevTrack: playPrev,
      getCurrentTrack,
      getPlayState: () => playState,
    }),
    [togglePlayPause, playNext, playPrev, getCurrentTrack, playState]
  );

  useEffect(() => {
    onControlsReady?.(controls);
  }, [onControlsReady, controls]);

  useEffect(() => {
    onAudioElementReady?.(null);
  }, [onAudioElementReady]);

  useEffect(() => {
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
        getSecStreamService: () => secStreamRef.current,
        setVolume: (vol: number) => {
          setVolume(vol);
          if (secStreamRef.current) {
            secStreamRef.current.setVolume(vol);
          }
        },
      };
    }
  }, [playTrack, currentTrackIndex, stop, playNext, playPrev, togglePlayPause, getCurrentTrack, playState, shuffledPlaylist]);

  return null;
};

export default AudioManager;
