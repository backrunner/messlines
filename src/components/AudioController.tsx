import React, { useState, useCallback, useRef } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';
import AudioManager from './AudioManager';
import PureAudioVisualizer from './PureAudioVisualizer';
import UserInteractionController from './UserInteractionController';
import PauseIndicator from './PauseIndicator';
import PlayIndicator from './PlayIndicator';
import BottomOverlay from './BottomOverlay';

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
  const [trackDirection, setTrackDirection] = useState<'next' | 'prev' | 'none'>('none');
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  const [audioControls, setAudioControls] = useState<AudioControls | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [audioContextSuspended, setAudioContextSuspended] = useState<boolean>(false);

  // Audio reactive callbacks reference - stable reference object
  const audioReactiveCallbacks = useRef({
    onTransient: (intensity: number, frequency: 'low' | 'mid' | 'high') => {},
    onBeat: (strength: number) => {},
  });

  // Handle track change
  const handleTrackChange = useCallback((track: AudioTrack, trackIndex: number, direction: 'next' | 'prev' | 'none') => {
    setCurrentTrack(track);
    setCurrentTrackIndex(trackIndex);
    setTrackDirection(direction);
  }, []);

  // Handle play state change
  const handlePlayStateChange = useCallback((state: PlayState) => {
    setPlayState(state);
  }, []);

  // Handle AudioContext suspended
  const handleAudioContextSuspended = useCallback((suspended: boolean) => {
    console.log('🎮 AudioController: AudioContext suspension state changed:', suspended);
    setAudioContextSuspended(suspended);
    console.log(`🎮 AudioController: ${suspended ? 'Showing' : 'Hiding'} PlayIndicator`);
  }, []);

  // Handle audio controls ready
  const handleControlsReady = useCallback((controls: AudioControls) => {
    setAudioControls(controls);
  }, []);

  // Handle SecStream audio context ready
  const handleSecStreamReady = useCallback((audioContext: AudioContext) => {
    // Connect audio reactive callbacks for visualizations
    if (typeof window !== 'undefined' && (window as any).audioReactiveCallbacks) {
      const callbacks = (window as any).audioReactiveCallbacks;
      callbacks.current.onTransient = (intensity: number, frequency: 'low' | 'mid' | 'high') => {
        audioReactiveCallbacks.current.onTransient(intensity, frequency);
      };
      callbacks.current.onBeat = (strength: number) => {
        audioReactiveCallbacks.current.onBeat(strength);
      };
    }
    console.log('✅ SecStream audio context connected to visualizations');
  }, []);

  // Handle initial play request (handle AudioContext suspension)
  const handleInitialPlay = useCallback(() => {
    if (audioControls && (playState === PlayState.STOPPED || audioContextSuspended)) {
      setAudioContextSuspended(false); // Reset audio context suspended state
      audioControls.togglePlayPause();
    }
  }, [audioControls, playState, audioContextSuspended]);

  // Calculate if animation should be paused
  const isAnimationPaused = playState === PlayState.PAUSED;

  console.log('🎮 AudioController render - audioContextSuspended:', audioContextSuspended, 'playState:', playState);

  return (
    <>
      {/* Audio Manager - handles all audio playback logic */}
      <AudioManager onTrackChange={handleTrackChange} onPlayStateChange={handlePlayStateChange} onControlsReady={handleControlsReady} onSecStreamReady={handleSecStreamReady} onAudioContextSuspended={handleAudioContextSuspended} />

      {/* User Interaction Controller - handles keyboard and touch events */}
      {audioControls && <UserInteractionController playState={playState} onTogglePlayPause={audioControls.togglePlayPause} onNextTrack={audioControls.nextTrack} onPrevTrack={audioControls.prevTrack} onInitialPlay={audioContextSuspended ? handleInitialPlay : undefined} />}

      {/* Pause Indicator - shows pause icon in top left */}
      <PauseIndicator playState={playState} />

      {/* Play Indicator - shows play button in top right when AudioContext is suspended */}
      {audioContextSuspended && (
        <>
          <PlayIndicator playState={playState} onPlay={handleInitialPlay} />
          {console.log('✅ PlayIndicator is rendered')}
        </>
      )}

      {/* Pure JavaScript Audio Visualizer - high performance, no React re-renders */}
      <PureAudioVisualizer currentTrack={currentTrack} currentTrackIndex={currentTrackIndex} trackDirection={trackDirection} playState={playState} isAnimationPaused={isAnimationPaused} audioReactiveCallbacks={audioReactiveCallbacks} />

      {/* Bottom Overlay - shows track info and music platform links */}
      <BottomOverlay currentTrack={currentTrack} />
    </>
  );
};

export default AudioController;
