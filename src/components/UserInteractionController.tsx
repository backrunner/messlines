import { useEffect, useRef, useCallback } from 'react';
import { PlayState } from '../constants/playlist';

interface UserInteractionControllerProps {
  playState: PlayState;
  onTogglePlayPause: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
}

const UserInteractionController = ({
  playState,
  onTogglePlayPause,
  onNextTrack,
  onPrevTrack,
}: UserInteractionControllerProps) => {
  const touchStartY = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const isScrolling = useRef<boolean>(false);

  // 键盘事件处理
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 防止在输入框等元素中触发
    if (event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement) {
      return;
    }

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        onTogglePlayPause();
        break;
      case 'ArrowRight':
      case 'Equal': // + 键
      case 'NumpadAdd':
        event.preventDefault();
        onNextTrack();
        break;
      case 'ArrowLeft':
      case 'Minus':
      case 'NumpadSubtract':
        event.preventDefault();
        onPrevTrack();
        break;
      case 'ArrowUp':
        event.preventDefault();
        onPrevTrack();
        break;
      case 'ArrowDown':
        event.preventDefault();
        onNextTrack();
        break;
    }
  }, [onTogglePlayPause, onNextTrack, onPrevTrack]);

  // 检测是否为移动设备
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
  };

  // 触摸开始
  const handleTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
    touchStartTime.current = Date.now();
    isScrolling.current = false;
  }, []);

  // 触摸移动
  const handleTouchMove = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    const deltaX = Math.abs(touch.clientX - touchStartX.current);
    
    // 如果移动距离超过阈值，标记为滚动
    if (deltaY > 10 || deltaX > 10) {
      isScrolling.current = true;
    }
  }, []);

  // 触摸结束
  const handleTouchEnd = useCallback((event: TouchEvent) => {
    const touch = event.changedTouches[0];
    const deltaY = touch.clientY - touchStartY.current;
    const deltaX = touch.clientX - touchStartX.current;
    const deltaTime = Date.now() - touchStartTime.current;
    const target = event.target as HTMLElement;
    
    // 检查是否点击了可交互元素
    const isInteractiveElement = target.closest('button') || 
                                target.closest('a') || 
                                target.closest('input') ||
                                target.closest('select') ||
                                target.closest('textarea') ||
                                target.closest('[role="button"]') ||
                                target.closest('.music-platform-button');

    if (isInteractiveElement) {
      return;
    }

    // 如果是短时间的小距离移动，视为点击
    if (!isScrolling.current && deltaTime < 500 && Math.abs(deltaY) < 30 && Math.abs(deltaX) < 30) {
      onTogglePlayPause();
      return;
    }

    // 垂直滑动手势检测
    const minSwipeDistance = 50;
    const maxSwipeTime = 800;
    
    if (Math.abs(deltaY) > minSwipeDistance && 
        Math.abs(deltaY) > Math.abs(deltaX) && 
        deltaTime < maxSwipeTime) {
      
      event.preventDefault();
      
      if (deltaY < 0) {
        // 向上滑动 - 上一首
        onPrevTrack();
      } else {
        // 向下滑动 - 下一首
        onNextTrack();
      }
    }
  }, [onTogglePlayPause, onNextTrack, onPrevTrack]);

  // 添加事件监听器
  useEffect(() => {
    // 键盘事件
    document.addEventListener('keydown', handleKeyDown);
    
    // 触摸事件（仅移动端）
    if (isMobile()) {
      document.addEventListener('touchstart', handleTouchStart, { passive: false });
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (isMobile()) {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [handleKeyDown, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // 这个组件不渲染任何内容，只处理事件
  return null;
};

export default UserInteractionController;
