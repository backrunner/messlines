import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AUDIO_PLAYLIST, AUDIO_CONFIG, PlayState } from '../constants/playlist';
import type { AudioTrack } from '../constants/playlist';
import { SecStreamService } from '../services/SecStreamService';
import PureAudioAnalyzer from './PureAudioAnalyzer';

interface AudioManagerProps {
  onTrackChange?: (track: AudioTrack, trackIndex: number) => void;
  onPlayStateChange?: (state: PlayState) => void;
  onControlsReady?: (controls: AudioControls) => void;
  onSecStreamReady?: (audioContext: AudioContext) => void;
  onAudioContextSuspended?: (suspended: boolean) => void;
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

const AudioManager = ({ onTrackChange, onPlayStateChange, onControlsReady, onSecStreamReady, onAudioContextSuspended }: AudioManagerProps) => {
  const secStreamRef = useRef<SecStreamService | null>(null);
  const audioAnalyzerRef = useRef<PureAudioAnalyzer | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  const [shuffledPlaylist, setShuffledPlaylist] = useState<AudioTrack[]>([]);
  const [volume, setVolume] = useState<number>(AUDIO_CONFIG.volume);
  const isInitializedRef = useRef(false);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Audio reactive callbacks reference
  const audioReactiveCallbacks = useRef({
    onTransient: (intensity: number, frequency: 'low' | 'mid' | 'high') => {},
    onBeat: (strength: number) => {},
  });

  // Initialize SecStream audio analyzer on component mount
  useEffect(() => {
    secStreamRef.current = new SecStreamService();

    // Initialize audio analyzer for SecStream only
    audioAnalyzerRef.current = new PureAudioAnalyzer({
      onTransientDetected: (intensity: number, frequency: 'low' | 'mid' | 'high') => {
        audioReactiveCallbacks.current.onTransient(intensity, frequency);
      },
      onBeatDetected: (strength: number) => {
        audioReactiveCallbacks.current.onBeat(strength);
      },
    });

    return () => {
      // Clean up fade interval
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }

      if (secStreamRef.current) {
        secStreamRef.current.destroy();
        secStreamRef.current = null;
      }
      if (audioAnalyzerRef.current) {
        audioAnalyzerRef.current.destroy();
        audioAnalyzerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (AUDIO_PLAYLIST.length === 0) return;

    if (AUDIO_CONFIG.shufflePlay) {
      const shuffled = shuffleArray(AUDIO_PLAYLIST);
      setShuffledPlaylist(shuffled);
    } else {
      setShuffledPlaylist(AUDIO_PLAYLIST);
    }
    setCurrentTrackIndex(0);
  }, []);

  const getCurrentTrack = useCallback((): AudioTrack | null => {
    if (shuffledPlaylist.length === 0) return null;
    return shuffledPlaylist[currentTrackIndex] || null;
  }, [shuffledPlaylist, currentTrackIndex]);

  const playNext = useCallback(() => {
    if (shuffledPlaylist.length === 0) return;

    let nextIndex = currentTrackIndex + 1;

    if (nextIndex >= shuffledPlaylist.length) {
      if (AUDIO_CONFIG.loop) {
        // Loop enabled: reshuffle playlist and restart from beginning
        const newShuffled = AUDIO_CONFIG.shufflePlay ? shuffleArray(AUDIO_PLAYLIST) : AUDIO_PLAYLIST;
        setShuffledPlaylist(newShuffled);
        nextIndex = 0;
        console.log('🔁 Playlist ended, looping and reshuffling...');
      } else {
        // No loop: stop playback and fade out background effects
        console.log('🛑 Playlist ended, stopping playback...');
        setPlayState(PlayState.STOPPED);
        onPlayStateChange?.(PlayState.STOPPED);
        return;
      }
    }

    // Smooth transition to next track
    console.log(`⏭️ Transitioning to next track: ${nextIndex}`);
    setCurrentTrackIndex(nextIndex);
  }, [shuffledPlaylist, currentTrackIndex, onPlayStateChange]);

  const playPrev = useCallback(() => {
    if (shuffledPlaylist.length === 0) return;

    let prevIndex = currentTrackIndex - 1;

    if (prevIndex < 0) {
      prevIndex = shuffledPlaylist.length - 1;
    }

    setCurrentTrackIndex(prevIndex);
  }, [shuffledPlaylist, currentTrackIndex]);

  const playTrack = useCallback(
    async (trackIndex: number, throwOnError: boolean = false) => {
      const track = shuffledPlaylist[trackIndex];
      if (!track || !secStreamRef.current) return;

      try {
        // Stop any currently playing audio first
        if (secStreamRef.current) {
          secStreamRef.current.stop();
        }

        setPlayState(PlayState.LOADING);

        console.log(`🔐 Playing with SecStream: ${track.title}`);

        await secStreamRef.current.createSecureAudioUrl(track);

        secStreamRef.current.setVolume(volume);

        // Connect audio analysis to SecStream's audio context
        const audioContext = secStreamRef.current.getAudioContext();
        if (audioContext && audioAnalyzerRef.current) {
          audioAnalyzerRef.current.setSecStreamAudioContext(audioContext);

          // Get the analyzer node from SecStreamService and connect it
          const analyzerNode = secStreamRef.current.getAnalyzerNode();
          if (analyzerNode) {
            audioAnalyzerRef.current.setAnalyzerNode(analyzerNode);
            console.log('✅ Analyzer connected to real-time SecStream audio');
          }

          onSecStreamReady?.(audioContext);

          // Monitor AudioContext state changes
          const handleAudioContextStateChange = () => {
            console.log(`AudioContext state changed to: ${audioContext.state}`);
            if (audioContext.state === 'suspended') {
              console.log('⚠️ AudioContext is suspended, user interaction required');
              // Notify parent component to show PlayIndicator
              onAudioContextSuspended?.(true);
            } else if (audioContext.state === 'running') {
              // Clear PlayIndicator when AudioContext is running
              onAudioContextSuspended?.(false);
            }
          };

          audioContext.addEventListener('statechange', handleAudioContextStateChange);
        }

        const handleSecStreamEnded = () => {
          console.log('🏁 Track ended, transitioning to next...');

          // Clear any existing fade interval
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }

          // Apply fade-out effect before transitioning
          if (secStreamRef.current && AUDIO_CONFIG.fadeOutDuration > 0) {
            const currentVol = volume;
            const fadeSteps = 20;
            const fadeInterval = AUDIO_CONFIG.fadeOutDuration / fadeSteps;
            let step = 0;

            fadeIntervalRef.current = setInterval(() => {
              step++;
              const newVolume = currentVol * (1 - step / fadeSteps);
              secStreamRef.current?.setVolume(newVolume);

              if (step >= fadeSteps) {
                if (fadeIntervalRef.current) {
                  clearInterval(fadeIntervalRef.current);
                  fadeIntervalRef.current = null;
                }
                // Reset volume for next track
                secStreamRef.current?.setVolume(currentVol);
                // Transition to next track
                playNext();
              }
            }, fadeInterval);
          } else {
            // No fade-out, immediate transition
            playNext();
          }
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

        const handleSecStreamSuspended = (event: Event) => {
          console.warn('🔴 SecStream suspended event received:', event);
          const customEvent = event as CustomEvent;
          console.log('🔴 Event detail:', customEvent.detail);
          const audioContext = secStreamRef.current?.getAudioContext();
          console.log('🔴 AudioContext state on suspended event:', audioContext?.state);
          if (audioContext && audioContext.state === 'suspended') {
            console.log('⚠️ AudioContext is suspended, showing PlayIndicator for user interaction');
            setPlayState(PlayState.STOPPED);
            onPlayStateChange?.(PlayState.STOPPED);
            onAudioContextSuspended?.(true);
          }
        };

        const player = secStreamRef.current.getPlayer();
        console.log('🎮 Attaching event listeners to player:', !!player);
        console.log('🎮 Player is EventTarget:', player instanceof EventTarget);
        if (player) {
          // Test that event listener attachment works
          const testHandler = () => console.log('🧪 Test event received');
          player.addEventListener('test', testHandler);
          player.dispatchEvent(new CustomEvent('test'));
          player.removeEventListener('test', testHandler);

          // Add a catch-all event listener to see ALL events
          const allEventsHandler = (event: Event) => {
            console.log('📢 Event dispatched on player:', event.type, event);
          };
          player.addEventListener('suspended', allEventsHandler);
          player.addEventListener('error', allEventsHandler);
          player.addEventListener('ended', allEventsHandler);

          player.addEventListener('ended', handleSecStreamEnded);
          player.addEventListener('error', handleSecStreamError);
          player.addEventListener('timeupdate', handleSecStreamTimeUpdate);
          player.addEventListener('suspended', handleSecStreamSuspended);
          console.log('✅ Event listeners attached, including suspended handler');

          // Verify the listener is attached by checking the player's internal state
          console.log('🔍 Verifying suspended listener is attached...');
        }

        console.log('🎵 About to call secStreamRef.current.play()');
        try {
          await secStreamRef.current.play();
          console.log('✅ Play() call completed in AudioManager');

          // Clear any existing fade interval
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }

          // Apply fade-in effect after starting playback
          if (AUDIO_CONFIG.fadeInDuration > 0) {
            secStreamRef.current.setVolume(0); // Start from zero
            const fadeSteps = 20;
            const fadeInterval = AUDIO_CONFIG.fadeInDuration / fadeSteps;
            let step = 0;

            fadeIntervalRef.current = setInterval(() => {
              step++;
              const newVolume = volume * (step / fadeSteps);
              secStreamRef.current?.setVolume(newVolume);

              if (step >= fadeSteps) {
                if (fadeIntervalRef.current) {
                  clearInterval(fadeIntervalRef.current);
                  fadeIntervalRef.current = null;
                }
                secStreamRef.current?.setVolume(volume); // Ensure final volume is set
              }
            }, fadeInterval);
          } else {
            secStreamRef.current.setVolume(volume);
          }
        } catch (playError) {
          console.error('❌ Play() threw error in AudioManager:', playError);
          throw playError; // Re-throw to outer catch
        }

        // Check if AudioContext is still suspended after play attempt
        const playAudioContext = secStreamRef.current.getAudioContext();
        console.log('🔍 Checking AudioContext state after play:', playAudioContext?.state);
        if (playAudioContext && playAudioContext.state === 'suspended') {
          console.log('🔴 AudioContext suspended after play attempt - autoplay blocked');
          setPlayState(PlayState.STOPPED);
          onPlayStateChange?.(PlayState.STOPPED);
          onAudioContextSuspended?.(true);
          if (throwOnError) {
            throw new Error('AudioContext blocked by browser autoplay policy');
          }
          return;
        }

        console.log('✅ Playback started successfully, setting state to PLAYING');
        setPlayState(PlayState.PLAYING);
        setCurrentTrackIndex(trackIndex);

        onTrackChange?.(track, trackIndex);
        onPlayStateChange?.(PlayState.PLAYING);

      } catch (error) {
        console.error('SecStream playback failed:', error);

        // Check if it's an autoplay policy error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('AudioContext') || errorMessage.includes('user gesture')) {
          console.log('⚠️ Autoplay blocked by browser policy');
          setPlayState(PlayState.STOPPED);
          onPlayStateChange?.(PlayState.STOPPED);
          onAudioContextSuspended?.(true);
        }

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
    [shuffledPlaylist, volume, onTrackChange, onPlayStateChange, onAudioContextSuspended, playNext]
  );

  const stop = useCallback(() => {
    // Clear any ongoing fade effects
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    if (secStreamRef.current) {
      secStreamRef.current.stop();
      setPlayState(PlayState.STOPPED);
      onPlayStateChange?.(PlayState.STOPPED);
    }
  }, [onPlayStateChange]);

  // Track the last played index to prevent re-playing the same track
  const lastPlayedIndexRef = useRef<number>(-1);

  // Auto-play track when currentTrackIndex changes
  useEffect(() => {
    if (shuffledPlaylist.length > 0 &&
        (playState === PlayState.PLAYING || playState === PlayState.LOADING) &&
        currentTrackIndex !== lastPlayedIndexRef.current) {
      lastPlayedIndexRef.current = currentTrackIndex;
      playTrack(currentTrackIndex);
    }
  }, [currentTrackIndex, shuffledPlaylist.length, playState]);

  const togglePlayPause = useCallback(() => {
    if (!secStreamRef.current) return;

    // Check if AudioContext is suspended and resume it with user interaction
    const audioContext = secStreamRef.current.getAudioContext();
    if (audioContext && audioContext.state === 'suspended') {
      console.log('🎵 Resuming suspended AudioContext with user interaction');
      audioContext.resume()
        .then(() => {
          console.log('✅ AudioContext resumed successfully');
          onAudioContextSuspended?.(false);
          // Continue with normal playback logic
          if (playState === PlayState.PAUSED || playState === PlayState.STOPPED || playState === PlayState.ERROR) {
            secStreamRef.current?.play();
            setPlayState(PlayState.PLAYING);
            onPlayStateChange?.(PlayState.PLAYING);
          }
        })
        .catch((err) => {
          console.error('❌ Failed to resume AudioContext:', err);
        });
      return;
    }

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
  }, [playState, onPlayStateChange, playTrack, currentTrackIndex, onAudioContextSuspended]);

  useEffect(() => {
    if (AUDIO_CONFIG.autoPlay && shuffledPlaylist.length > 0 && !isInitializedRef.current && playState === PlayState.STOPPED) {
      isInitializedRef.current = true;
      lastPlayedIndexRef.current = 0; // Mark track 0 as being played to prevent duplicate

      setTimeout(async () => {
        try {
          await playTrack(0, true);
          console.log('✅ Autoplay started successfully');
        } catch (error) {
          console.log('⚠️ Autoplay blocked by browser (expected behavior):', error);
          // AudioContext suspension will be detected and onAudioContextSuspended will be called
          // The PlayIndicator will be shown to prompt user interaction
          setPlayState(PlayState.STOPPED);
          onPlayStateChange?.(PlayState.STOPPED);
          // Don't rethrow - this is expected behavior for autoplay
        }
      }, 3000);
    }
  }, [shuffledPlaylist, playState, playTrack, onPlayStateChange]);

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

  // Update audio analyzer play state
  useEffect(() => {
    if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.setPlayState(playState);
    }
  }, [playState]);

  // Expose SecStream audio reactive callbacks globally for visualizations
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).audioReactiveCallbacks = audioReactiveCallbacks;
    }
  }, []);

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
