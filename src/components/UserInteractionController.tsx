import { useEffect, useRef, useCallback } from 'react';
import { PlayState } from '../constants/playlist';

interface UserInteractionControllerProps {
  playState: PlayState;
  onTogglePlayPause: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onInitialPlay?: () => void;
}

const UserInteractionController = ({ playState, onTogglePlayPause, onNextTrack, onPrevTrack, onInitialPlay }: UserInteractionControllerProps) => {
  const touchStartY = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const isScrolling = useRef<boolean>(false);
  const lastTrackChangeTime = useRef<number>(0);
  const TRACK_CHANGE_COOLDOWN = 500; // 500ms 冷却时间

  // Track change with cooldown
  const handleNextTrackWithCooldown = useCallback(() => {
    const now = Date.now();
    if (now - lastTrackChangeTime.current >= TRACK_CHANGE_COOLDOWN) {
      lastTrackChangeTime.current = now;
      onNextTrack();
    }
  }, [onNextTrack]);

  const handlePrevTrackWithCooldown = useCallback(() => {
    const now = Date.now();
    if (now - lastTrackChangeTime.current >= TRACK_CHANGE_COOLDOWN) {
      lastTrackChangeTime.current = now;
      onPrevTrack();
    }
  }, [onPrevTrack]);

  // Handle keyboard events for media control
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Prevent triggering in input elements
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          // Call initial play if in STOPPED state and callback is available
          if (playState === PlayState.STOPPED && onInitialPlay) {
            onInitialPlay();
          } else {
            onTogglePlayPause();
          }
          break;
        case 'ArrowRight':
        case 'Equal': // + key
        case 'NumpadAdd':
          event.preventDefault();
          handleNextTrackWithCooldown();
          break;
        case 'ArrowLeft':
        case 'Minus':
        case 'NumpadSubtract':
          event.preventDefault();
          handlePrevTrackWithCooldown();
          break;
        case 'ArrowUp':
          event.preventDefault();
          handleNextTrackWithCooldown();
          break;
        case 'ArrowDown':
          event.preventDefault();
          handlePrevTrackWithCooldown();
          break;
      }
    },
    [onTogglePlayPause, handleNextTrackWithCooldown, handlePrevTrackWithCooldown, playState, onInitialPlay]
  );

  // Handle desktop click events
  const handleClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if clicked on interactive elements
      const isInteractiveElement = target.closest('button') || target.closest('a') || target.closest('input') || target.closest('select') || target.closest('textarea') || target.closest('[role="button"]') || target.closest('.music-platform-button') || target.closest('.play-indicator') || target.closest('.pause-indicator');

      if (isInteractiveElement) {
        return;
      }

      // Only handle page clicks to start playback when in STOPPED state
      if (playState === PlayState.STOPPED && onInitialPlay) {
        onInitialPlay();
      }
    },
    [playState, onInitialPlay]
  );

  // Detect mobile device
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  };

  const handleTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
    touchStartTime.current = Date.now();
    isScrolling.current = false;
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    const deltaX = Math.abs(touch.clientX - touchStartX.current);

    // Mark as scrolling if movement exceeds threshold
    if (deltaY > 10 || deltaX > 10) {
      isScrolling.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const deltaY = touch.clientY - touchStartY.current;
      const deltaX = touch.clientX - touchStartX.current;
      const deltaTime = Date.now() - touchStartTime.current;
      const target = event.target as HTMLElement;

      // Check if touched interactive elements
      const isInteractiveElement = target.closest('button') || target.closest('a') || target.closest('input') || target.closest('select') || target.closest('textarea') || target.closest('[role="button"]') || target.closest('.music-platform-button');

      if (isInteractiveElement) {
        return;
      }

      // Treat short-time small movement as tap
      if (!isScrolling.current && deltaTime < 500 && Math.abs(deltaY) < 30 && Math.abs(deltaX) < 30) {
        // Call initial play if in STOPPED state and callback is available
        if (playState === PlayState.STOPPED && onInitialPlay) {
          onInitialPlay();
        } else {
          // Otherwise toggle play/pause normally
          onTogglePlayPause();
        }
        return;
      }

      // Vertical swipe gesture detection
      const minSwipeDistance = 50;
      const maxSwipeTime = 800;

      if (Math.abs(deltaY) > minSwipeDistance && Math.abs(deltaY) > Math.abs(deltaX) && deltaTime < maxSwipeTime) {
        event.preventDefault();

        if (deltaY < 0) {
          // Swipe up - next track
          handleNextTrackWithCooldown();
        } else {
          // Swipe down - previous track
          handlePrevTrackWithCooldown();
        }
      }
    },
    [onTogglePlayPause, handleNextTrackWithCooldown, handlePrevTrackWithCooldown]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    // Desktop click events (initial play in STOPPED state only)
    if (!isMobile()) {
      document.addEventListener('click', handleClick);
    }

    // Touch events (mobile only)
    if (isMobile()) {
      document.addEventListener('touchstart', handleTouchStart, { passive: false });
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (!isMobile()) {
        document.removeEventListener('click', handleClick);
      }
      if (isMobile()) {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [handleKeyDown, handleClick, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // This component renders nothing, only handles events
  return null;
};

export default UserInteractionController;
