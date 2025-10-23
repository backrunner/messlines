import { useEffect, useRef } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';
import PureLineBallAnimation from './PureLineBallAnimation';
import BackgroundNumbersManager from './BackgroundNumbersManager';

interface PureAudioVisualizerProps {
  currentTrack?: AudioTrack | null;
  currentTrackIndex?: number;
  trackDirection?: 'next' | 'prev' | 'none';
  playState?: PlayState;
  isAnimationPaused?: boolean;
  audioReactiveCallbacks?: React.MutableRefObject<{
    onTransient: (intensity: number, frequency: 'low' | 'mid' | 'high') => void;
    onBeat: (strength: number) => void;
  }>;
}

const PureAudioVisualizer = ({ currentTrack, currentTrackIndex = 0, trackDirection = 'none', playState = PlayState.STOPPED, isAnimationPaused = false, audioReactiveCallbacks }: PureAudioVisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const backgroundContainerRef = useRef<HTMLDivElement>(null);
  const lineAnimationRef = useRef<PureLineBallAnimation | null>(null);
  const backgroundNumbersManagerRef = useRef<BackgroundNumbersManager | null>(null);

  // Initialize pure JavaScript animation system
  useEffect(() => {
    if (!containerRef.current || !backgroundContainerRef.current) return;

    // Initialize line animation with audio-reactive options
    lineAnimationRef.current = new PureLineBallAnimation(containerRef.current, {
      enableBeatSync: true,
      enableTransientSync: true,
      beatSensitivity: 0.4,
      transientSensitivity: 0.3,
    });

    // Enable audio-reactive mode (disables automatic spawning, uses audio events instead)
    lineAnimationRef.current.enableAudioReactiveMode();

    // Initialize background numbers manager
    backgroundNumbersManagerRef.current = new BackgroundNumbersManager(backgroundContainerRef.current);

    return () => {
      // Clean up resources
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

  // Handle play state changes
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

  // Handle track changes
  useEffect(() => {
    if (backgroundNumbersManagerRef.current) {
      backgroundNumbersManagerRef.current.setCurrentTrack(currentTrack, currentTrackIndex, trackDirection);
    }
  }, [currentTrack, currentTrackIndex, trackDirection]);

  // Set audio reactive callbacks
  useEffect(() => {
    if (audioReactiveCallbacks) {
      audioReactiveCallbacks.current.onTransient = (intensity: number, frequency: 'low' | 'mid' | 'high') => {
        // Forward to background numbers manager
        backgroundNumbersManagerRef.current?.handleTransient(intensity, frequency);

        // Forward to line ball animation
        lineAnimationRef.current?.onTransientDetected(intensity, frequency);
      };

      audioReactiveCallbacks.current.onBeat = (strength: number) => {
        // Forward to background numbers manager
        backgroundNumbersManagerRef.current?.handleBeat(strength);

        // Forward to line ball animation
        lineAnimationRef.current?.onBeatDetected(strength);
      };
    }
  }, [audioReactiveCallbacks]);

  // Handle window resize
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null;

    const handleResize = () => {
      // Debounce to avoid frequent resize triggers
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        // Notify background numbers manager to resize
        if (backgroundNumbersManagerRef.current) {
          backgroundNumbersManagerRef.current.handleResize();
        }
      }, 150); // 150ms debounce delay
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
        background: 'linear-gradient(to top, #0a0a0a 40%, #000000)', // Initial background, will be updated by animation
        overflow: 'hidden',
      }}
    >
      {/* Background numbers container */}
      <div ref={backgroundContainerRef} />

      {/* Line animation container */}
      <div ref={containerRef} />
    </div>
  );
};

export default PureAudioVisualizer;
