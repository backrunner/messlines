import React, { useState, useCallback, useRef } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';
import AudioManager from './AudioManager';
import PureAudioVisualizer from './PureAudioVisualizer';
import UserInteractionController from './UserInteractionController';
import PauseIndicator from './PauseIndicator';
import PlayIndicator from './PlayIndicator';
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
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);

  // Audio reactive callbacks reference - stable reference object
  const audioReactiveCallbacks = useRef({
    onTransient: (intensity: number, frequency: 'low' | 'mid' | 'high') => {},
    onBeat: (strength: number) => {},
  });

  // Pure JavaScript audio analyzer instance
  const audioAnalyzerRef = useRef<PureAudioAnalyzer | null>(null);

  // Handle track change
  const handleTrackChange = useCallback((track: AudioTrack, trackIndex: number) => {
    setCurrentTrack(track);
    setCurrentTrackIndex(trackIndex);
  }, []);

  // Handle play state change
  const handlePlayStateChange = useCallback((state: PlayState) => {
    setPlayState(state);

    // Update pure JavaScript audio analyzer play state
    if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.setPlayState(state);
    }
  }, []);

  // Handle autoplay blocked
  const handleAutoplayBlocked = useCallback((blocked: boolean) => {
    setAutoplayBlocked(blocked);
  }, []);

  // Handle audio controls ready
  const handleControlsReady = useCallback((controls: AudioControls) => {
    setAudioControls(controls);
  }, []);

  // Handle audio element ready
  const handleAudioElementReady = useCallback((element: HTMLAudioElement | null) => {
    setAudioElement(element);

    // Initialize pure JavaScript audio analyzer
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

  // Cleanup audio analyzer resources
  const cleanupAudioAnalyzer = useCallback(() => {
    if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.destroy();
      audioAnalyzerRef.current = null;
    }
  }, []);

  // Handle initial play request (handle autoplay restrictions)
  const handleInitialPlay = useCallback(() => {
    if (audioControls && (playState === PlayState.STOPPED || autoplayBlocked)) {
      setAutoplayBlocked(false); // Reset autoplay block state after user interaction
      audioControls.togglePlayPause();
    }
  }, [audioControls, playState, autoplayBlocked]);

  // Calculate if animation should be paused
  const isAnimationPaused = playState === PlayState.PAUSED;

  // Component cleanup
  React.useEffect(() => {
    return () => {
      cleanupAudioAnalyzer();
    };
  }, [cleanupAudioAnalyzer]);

  return (
    <>
      {/* Audio Manager - handles all audio playback logic */}
      <AudioManager onTrackChange={handleTrackChange} onPlayStateChange={handlePlayStateChange} onControlsReady={handleControlsReady} onAudioElementReady={handleAudioElementReady} onAutoplayBlocked={handleAutoplayBlocked} />

      {/* User Interaction Controller - handles keyboard and touch events */}
      {audioControls && <UserInteractionController playState={playState} onTogglePlayPause={audioControls.togglePlayPause} onNextTrack={audioControls.nextTrack} onPrevTrack={audioControls.prevTrack} onInitialPlay={autoplayBlocked ? handleInitialPlay : undefined} />}

      {/* Pause Indicator - shows pause icon in top left */}
      <PauseIndicator playState={playState} />

      {/* Play Indicator - shows play button in top right (only when autoplay is blocked) */}
      {autoplayBlocked && <PlayIndicator playState={playState} onPlay={handleInitialPlay} />}

      {/* Pure JavaScript Audio Visualizer - high performance, no React re-renders */}
      <PureAudioVisualizer currentTrack={currentTrack} currentTrackIndex={currentTrackIndex} playState={playState} isAnimationPaused={isAnimationPaused} audioReactiveCallbacks={audioReactiveCallbacks} />
    </>
  );
};

export default AudioController;
