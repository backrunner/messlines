/**
 * High-performance background numbers manager
 * Direct DOM manipulation to avoid React re-render performance issues
 */

interface ZeroState {
  isOutline: boolean;
  opacity: number;
  element: HTMLDivElement;
  isEmpty: boolean; // Marks whether this position should be empty
}

interface AudioReactiveState {
  transientActive: boolean;
  beatActive: boolean;
  transientIntensity: number;
  beatStrength: number;
  dominantFrequency: 'low' | 'mid' | 'high';
}

class BackgroundNumbersManager {
  private container: HTMLDivElement | null = null;
  private zeroGrid: { [key: string]: ZeroState } = {};
  private numbersVisible = false;
  private currentTrackIndex = 0;
  private currentTrack: any = null;
  private audioReactiveState: AudioReactiveState = {
    transientActive: false,
    beatActive: false,
    transientIntensity: 0,
    beatStrength: 0,
    dominantFrequency: 'mid',
  };

  private animationFrameId: number | null = null;
  private transientTimeoutId: NodeJS.Timeout | null = null;
  private beatTimeoutId: NodeJS.Timeout | null = null;

  // Configuration constants
  private readonly FONT_SIZE = 120;
  private readonly SPACING = this.FONT_SIZE * 0.8;
  private readonly OVERFLOW = this.FONT_SIZE;
  private readonly MIN_EMPTY_PERCENTAGE = 0.1; // At least 10% of positions should be empty

  constructor(containerElement: HTMLDivElement) {
    this.container = containerElement;
    this.initializeContainer();
    this.generateInitialGrid();
    this.startPeriodicUpdates();
  }

  private initializeContainer() {
    if (!this.container) return;

    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '1';
    this.container.style.overflow = 'hidden';
  }

  private generateInitialGrid() {
    if (!this.container) return;

    const { width, height } = this.getViewportDimensions();

    // Clear existing elements
    this.container.innerHTML = '';
    this.zeroGrid = {};

    // Calculate grid bounds
    const startX = -this.OVERFLOW;
    const endX = width + this.OVERFLOW;
    const startY = -this.OVERFLOW;
    const endY = height + this.OVERFLOW;

    const cols = Math.ceil((endX - startX) / this.SPACING);
    const rows = Math.ceil((endY - startY) / this.SPACING);

    // Calculate total positions and required empty positions
    const totalPositions = rows * cols;
    const emptyPositionsCount = Math.floor(totalPositions * this.MIN_EMPTY_PERCENTAGE);

    // Generate random empty position indices
    const emptyPositions = new Set<number>();
    while (emptyPositions.size < emptyPositionsCount) {
      const randomIndex = Math.floor(Math.random() * totalPositions);
      emptyPositions.add(randomIndex);
    }

    let positionIndex = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * this.SPACING;
        const y = startY + row * this.SPACING;
        const zeroKey = `${row}-${col}`;
        const isEmpty = emptyPositions.has(positionIndex);

        this.createZeroElement(zeroKey, x, y, startY, endY, isEmpty);
        positionIndex++;
      }
    }
  }

  private createZeroElement(key: string, x: number, y: number, startY: number, endY: number, isEmpty: boolean = false) {
    if (!this.container) return;

    const element = document.createElement('div');
    const normalizedY = (y - startY) / (endY - startY);
    const bottomGray = 0x33;
    const topGray = 0x11;
    const grayValue = Math.round(topGray + (bottomGray - topGray) * normalizedY);
    const hexGray = grayValue.toString(16).padStart(2, '0');
    const zeroColor = `#${hexGray}${hexGray}${hexGray}`;

    // Initial state
    const isOutline = Math.random() < 0.5;
    const opacity = 0.25; // Set initial opacity to a moderate value

    // Set styles
    element.style.position = 'absolute';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.fontSize = `${this.FONT_SIZE}px`;
    element.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    element.style.fontWeight = '900';
    element.style.userSelect = 'none';
    element.style.pointerEvents = 'none';
    element.style.opacity = '0'; // Initially hidden
    element.style.transition = 'color 1.5s ease-in-out, -webkit-text-stroke 1.5s ease-in-out, opacity 1.2s ease-in-out';

    this.updateElementStyle(element, isOutline, zeroColor, 0);

    // If not an empty position, display current track index
    if (!isEmpty) {
      const displayNumber = this.currentTrack ? this.currentTrackIndex.toString() : '0';
      element.textContent = displayNumber;
    } else {
      element.textContent = ''; // Empty positions show no content
    }

    this.container.appendChild(element);

    this.zeroGrid[key] = {
      isOutline,
      opacity,
      element,
      isEmpty,
    };
  }

  private calculateGradientColor(element: HTMLDivElement): string {
    const { width, height } = this.getViewportDimensions();

    // Get element position within viewport
    const elementTop = parseFloat(element.style.top);
    const elementY = elementTop + this.OVERFLOW; // Adjust for overflow offset

    // Calculate gradient range
    const startY = -this.OVERFLOW;
    const endY = height + this.OVERFLOW;

    // Calculate normalized Y position (0 at top, 1 at bottom)
    const normalizedY = Math.max(0, Math.min(1, (elementY - startY) / (endY - startY)));

    // Gradient color calculation: darker at top (#111), lighter at bottom (#333)
    const bottomGray = 0x33;
    const topGray = 0x11;
    const grayValue = Math.round(topGray + (bottomGray - topGray) * normalizedY);
    const hexGray = grayValue.toString(16).padStart(2, '0');

    return `#${hexGray}${hexGray}${hexGray}`;
  }

  private updateElementStyle(element: HTMLDivElement, isOutline: boolean, color: string, finalOpacity: number) {
    if (isOutline) {
      element.style.color = 'transparent';
      element.style.webkitTextStroke = `2px ${color}`;
    } else {
      element.style.color = color;
      element.style.webkitTextStroke = 'none';
    }
    element.style.opacity = finalOpacity.toString();
  }

  private getViewportDimensions() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  private startPeriodicUpdates() {
    let lastOutlineUpdate = 0;
    let lastFadeUpdate = 0;
    let lastEmptyPositionUpdate = 0;

    // Randomize initial intervals to avoid all updates triggering simultaneously
    let outlineInterval = 7000 + Math.random() * 3000; // 7-10s random interval
    let fadeInterval = 2500 + Math.random() * 2000;    // 2.5-4.5s random interval
    let emptyPositionInterval = 9000 + Math.random() * 4000; // 9-13s random interval

    const update = (now: number) => {
      // Random interval outline switching
      if (now - lastOutlineUpdate > outlineInterval) {
        this.randomOutlineUpdate();
        lastOutlineUpdate = now;
        // Re-randomize next interval
        outlineInterval = 6000 + Math.random() * 4000;
      }

      // Random interval opacity changes
      if (now - lastFadeUpdate > fadeInterval) {
        this.randomFadeUpdate();
        lastFadeUpdate = now;
        // Re-randomize next interval
        fadeInterval = 2000 + Math.random() * 3000;
      }

      // Random interval empty position switching
      if (now - lastEmptyPositionUpdate > emptyPositionInterval) {
        this.randomEmptyPositionUpdate();
        lastEmptyPositionUpdate = now;
        // Re-randomize next interval
        emptyPositionInterval = 8000 + Math.random() * 6000;
      }

      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private randomOutlineUpdate() {
    // Only apply outline updates to non-empty positions
    const nonEmptyKeys = Object.keys(this.zeroGrid).filter(key => !this.zeroGrid[key].isEmpty);
    if (nonEmptyKeys.length === 0) return;

    const changeCount = Math.floor(Math.random() * 8) + 3;
    const keysToChange: string[] = [];

    for (let i = 0; i < changeCount && i < nonEmptyKeys.length; i++) {
      let randomKey;
      do {
        randomKey = nonEmptyKeys[Math.floor(Math.random() * nonEmptyKeys.length)];
      } while (keysToChange.includes(randomKey));
      keysToChange.push(randomKey);
    }

    keysToChange.forEach(key => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState || zeroState.isEmpty) return;

      zeroState.isOutline = !zeroState.isOutline;
      this.updateZeroDisplay(key);
    });
  }

  private randomFadeUpdate() {
    // Only apply opacity updates to non-empty positions
    const nonEmptyKeys = Object.keys(this.zeroGrid).filter(key => !this.zeroGrid[key].isEmpty);
    if (nonEmptyKeys.length === 0) return;

    const fadeCount = Math.floor(Math.random() * 12) + 5;
    const keysToFade: string[] = [];

    for (let i = 0; i < fadeCount && i < nonEmptyKeys.length; i++) {
      let randomKey;
      do {
        randomKey = nonEmptyKeys[Math.floor(Math.random() * nonEmptyKeys.length)];
      } while (keysToFade.includes(randomKey));
      keysToFade.push(randomKey);
    }

    keysToFade.forEach(key => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState || zeroState.isEmpty) return;

      // Increase randomness and diversity in opacity changes
      const opacityPattern = Math.random();
      
      if (opacityPattern < 0.4) {
        // 40% chance: simple bright/dark toggle
        zeroState.opacity = zeroState.opacity > 0.25 ? 0.08 + Math.random() * 0.12 : 0.3 + Math.random() * 0.2;
      } else if (opacityPattern < 0.7) {
        // 30% chance: gradual change
        const currentOpacity = zeroState.opacity;
        const direction = Math.random() < 0.5 ? 1 : -1;
        const change = (Math.random() * 0.15 + 0.05) * direction;
        zeroState.opacity = Math.max(0.05, Math.min(0.6, currentOpacity + change));
      } else if (opacityPattern < 0.9) {
        // 20% chance: random zone setting
        const randomZone = Math.random();
        if (randomZone < 0.33) {
          zeroState.opacity = 0.05 + Math.random() * 0.15; // Low range
        } else if (randomZone < 0.66) {
          zeroState.opacity = 0.2 + Math.random() * 0.2; // Medium range
        } else {
          zeroState.opacity = 0.4 + Math.random() * 0.2; // High range
        }
      } else {
        // 10% chance: extreme values
        zeroState.opacity = Math.random() < 0.5 ? 0.02 + Math.random() * 0.08 : 0.5 + Math.random() * 0.3;
      }

      this.updateZeroDisplay(key);
    });
  }

  // Randomly switch empty positions
  private randomEmptyPositionUpdate() {
    const allKeys = Object.keys(this.zeroGrid);
    if (allKeys.length === 0) return;

    const totalPositions = allKeys.length;
    const targetEmptyCount = Math.floor(totalPositions * this.MIN_EMPTY_PERCENTAGE);
    const currentEmptyKeys = allKeys.filter(key => this.zeroGrid[key].isEmpty);
    const currentNonEmptyKeys = allKeys.filter(key => !this.zeroGrid[key].isEmpty);

    // Calculate number of positions to adjust (randomly switch some empty positions)
    const switchCount = Math.floor(Math.random() * Math.min(5, targetEmptyCount / 2)) + 1; // 1-5 positions

    // Randomly select some empty positions to fill
    const emptyKeysToFill: string[] = [];
    for (let i = 0; i < switchCount && i < currentEmptyKeys.length; i++) {
      let randomKey;
      do {
        randomKey = currentEmptyKeys[Math.floor(Math.random() * currentEmptyKeys.length)];
      } while (emptyKeysToFill.includes(randomKey));
      emptyKeysToFill.push(randomKey);
    }

    // Randomly select some non-empty positions to empty
    const nonEmptyKeysToEmpty: string[] = [];
    for (let i = 0; i < switchCount && i < currentNonEmptyKeys.length; i++) {
      let randomKey;
      do {
        randomKey = currentNonEmptyKeys[Math.floor(Math.random() * currentNonEmptyKeys.length)];
      } while (nonEmptyKeysToEmpty.includes(randomKey));
      nonEmptyKeysToEmpty.push(randomKey);
    }

    // Execute the switches
    emptyKeysToFill.forEach(key => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState) return;

      zeroState.isEmpty = false;
      // Set to display number
      const displayNumber = this.currentTrack ? this.currentTrackIndex.toString() : '0';
      zeroState.element.textContent = displayNumber;
      this.updateZeroDisplay(key);
    });

    nonEmptyKeysToEmpty.forEach(key => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState) return;

      zeroState.isEmpty = true;
      // Clear display content
      zeroState.element.textContent = '';
      // Hide immediately
      zeroState.element.style.opacity = '0';
    });
  }

  private updateZeroDisplay(key: string) {
    const zeroState = this.zeroGrid[key];
    if (!zeroState) return;

    const element = zeroState.element;

    // Always hide if it's an empty position
    if (zeroState.isEmpty) {
      element.style.opacity = '0';
      return;
    }

    const finalOpacity = this.numbersVisible ? zeroState.opacity : 0;

    // Recalculate position-based gradient color
    const gradientColor = this.calculateGradientColor(element);

    this.updateElementStyle(element, zeroState.isOutline, gradientColor, finalOpacity);
  }

  // Public method: set music playback state
  public setPlayState(isPlaying: boolean) {
    if (isPlaying && !this.numbersVisible) {
      // Delayed fade in
      setTimeout(() => {
        this.numbersVisible = true;
        this.updateAllZerosVisibility();
      }, 500);
    } else if (!isPlaying && this.numbersVisible) {
      // Immediate fade out
      this.numbersVisible = false;
      this.updateAllZerosVisibility();
    }
  }

  // Public method: set current track with animation
  public setCurrentTrack(track: any, trackIndex: number, direction: 'next' | 'prev' | 'none' = 'none') {
    this.currentTrack = track;
    const previousTrackIndex = this.currentTrackIndex;
    this.currentTrackIndex = trackIndex;

    if (direction !== 'none' && previousTrackIndex !== trackIndex) {
      // Trigger 3D flip animation and regenerate empty positions
      this.animateTrackSwitch(direction);
    } else {
      this.updateAllZerosContent();
    }
  }

  // Animate track switch with 3D cube flip effect
  private animateTrackSwitch(direction: 'next' | 'prev') {
    const allKeys = Object.keys(this.zeroGrid);
    const displayNumber = this.currentTrack ? this.currentTrackIndex.toString() : '0';

    // Regenerate empty positions randomly
    const totalPositions = allKeys.length;
    const emptyPositionsCount = Math.floor(totalPositions * this.MIN_EMPTY_PERCENTAGE);
    const newEmptyPositions = new Set<string>();

    // Randomly select new empty positions
    while (newEmptyPositions.size < emptyPositionsCount) {
      const randomKey = allKeys[Math.floor(Math.random() * allKeys.length)];
      newEmptyPositions.add(randomKey);
    }

    // Animate each number box with random staggered timing
    allKeys.forEach((key, index) => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState) return;

      const element = zeroState.element;
      const willBeEmpty = newEmptyPositions.has(key);

      // Random delay between 0-400ms for scattered, random effect across the entire view
      const randomDelay = Math.random() * 400;

      setTimeout(() => {
        this.flipNumberBox(element, zeroState, displayNumber, direction, willBeEmpty, key);
      }, randomDelay);
    });
  }

  // Perform 3D cube flip animation on a single number box
  private flipNumberBox(
    element: HTMLDivElement,
    zeroState: ZeroState,
    newNumber: string,
    direction: 'next' | 'prev',
    willBeEmpty: boolean,
    key: string
  ) {
    // Create wrapper for 3D transform
    const parent = element.parentElement;
    if (!parent) return;

    // Save original styles
    const originalTransform = element.style.transform || '';
    const originalTransition = element.style.transition || '';

    // Set up 3D perspective
    element.style.transformStyle = 'preserve-3d';
    element.style.backfaceVisibility = 'hidden';

    // Determine rotation direction
    const rotationDeg = direction === 'next' ? -90 : 90;
    const flipDuration = 300; // 300ms flip duration

    // Phase 1: Flip out (0 to 90 degrees)
    element.style.transition = `transform ${flipDuration / 2}ms cubic-bezier(0.55, 0.085, 0.68, 0.53), opacity ${flipDuration / 2}ms ease-out`;
    element.style.transform = `rotateY(${rotationDeg}deg)`;
    element.style.opacity = '0';

    // Phase 2: Update content at midpoint and flip in (90 to 0 degrees)
    setTimeout(() => {
      // Update content and empty state
      const wasEmpty = zeroState.isEmpty;
      zeroState.isEmpty = willBeEmpty;

      if (willBeEmpty) {
        element.textContent = '';
      } else {
        element.textContent = newNumber;
      }

      // Randomly change style for variety
      if (!willBeEmpty && Math.random() < 0.3) {
        zeroState.isOutline = !zeroState.isOutline;
      }
      if (!willBeEmpty && Math.random() < 0.4) {
        zeroState.opacity = 0.15 + Math.random() * 0.35;
      }

      // Flip in from opposite direction
      element.style.transform = `rotateY(${-rotationDeg}deg)`;

      // Small delay before flip in
      setTimeout(() => {
        element.style.transition = `transform ${flipDuration / 2}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity ${flipDuration / 2}ms ease-in`;
        element.style.transform = 'rotateY(0deg)';

        // Update display with new opacity
        this.updateZeroDisplay(key);
      }, 10);

      // Reset transform after animation completes
      setTimeout(() => {
        element.style.transformStyle = '';
        element.style.backfaceVisibility = '';
        element.style.transform = originalTransform;
        element.style.transition = originalTransition || 'color 1.5s ease-in-out, -webkit-text-stroke 1.5s ease-in-out, opacity 1.2s ease-in-out';
      }, flipDuration / 2 + 50);
    }, flipDuration / 2);
  }

  // Public method: handle audio transients
  public handleTransient(intensity: number, frequency: 'low' | 'mid' | 'high') {
    if (this.transientTimeoutId) {
      clearTimeout(this.transientTimeoutId);
    }

    this.audioReactiveState.transientActive = true;
    this.audioReactiveState.transientIntensity = intensity;
    this.audioReactiveState.dominantFrequency = frequency;

    this.applyTransientEffect(intensity, frequency);

    const effectDuration = Math.max(100, intensity * 300);
    this.transientTimeoutId = setTimeout(() => {
      this.audioReactiveState.transientActive = false;
      this.audioReactiveState.transientIntensity = 0;
      this.resetTransitionStyles();
    }, effectDuration);
  }

  // Public method: handle audio beats
  public handleBeat(strength: number) {
    if (this.beatTimeoutId) {
      clearTimeout(this.beatTimeoutId);
    }

    this.audioReactiveState.beatActive = true;
    this.audioReactiveState.beatStrength = strength;

    this.applyBeatEffect(strength);

    this.beatTimeoutId = setTimeout(() => {
      this.audioReactiveState.beatActive = false;
      this.audioReactiveState.beatStrength = 0;
      this.resetTransitionStyles();
    }, 200);
  }

  private applyTransientEffect(intensity: number, frequency: 'low' | 'mid' | 'high') {
    // Add randomness: transient intensity affects change count with random variation
    const baseChangeCount = Math.floor(intensity * 30) + 5;
    const randomVariation = Math.floor(Math.random() * 10) - 5; // Random variation from -5 to +5
    const changeCount = Math.max(3, baseChangeCount + randomVariation);

    // Only apply transient effects to non-empty positions
    const nonEmptyKeys = Object.keys(this.zeroGrid).filter(key => !this.zeroGrid[key].isEmpty);

    if (nonEmptyKeys.length === 0) return;

    const keysToChange: string[] = [];
    for (let i = 0; i < changeCount && i < nonEmptyKeys.length; i++) {
      let randomKey;
      do {
        randomKey = nonEmptyKeys[Math.floor(Math.random() * nonEmptyKeys.length)];
      } while (keysToChange.includes(randomKey));
      keysToChange.push(randomKey);
    }

    keysToChange.forEach(key => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState || zeroState.isEmpty) return;

      // Randomize transition time for more natural effects
      const transitionDuration = 0.08 + Math.random() * 0.04; // Random between 0.08-0.12s
      zeroState.element.style.transition = `color ${transitionDuration}s ease-out, -webkit-text-stroke ${transitionDuration}s ease-out, opacity ${transitionDuration}s ease-out`;

      // Apply different random effects based on frequency type
      const randomFactor = Math.random(); // Random factor 0-1
      
      if (frequency === 'low') {
        // Low frequency: prefer outline switching with random opacity changes
        if (randomFactor < 0.7) {
          zeroState.isOutline = !zeroState.isOutline;
        }
        if (randomFactor < 0.4) {
          // 40% chance to also change opacity
          zeroState.opacity = 0.05 + Math.random() * 0.35; // Random between 0.05-0.4
        }
      } else if (frequency === 'high') {
        // High frequency: mainly affects opacity, more flickering
        const opacityRandomness = Math.random() * 0.3; // Random bonus 0-0.3
        if (zeroState.opacity > 0.15) {
          zeroState.opacity = Math.max(0.02, 0.05 - opacityRandomness); // Darken with randomness
        } else {
          zeroState.opacity = Math.min(0.8, 0.6 + opacityRandomness); // Brighten with randomness
        }

        // 30% chance to also switch outline
        if (randomFactor < 0.3) {
          zeroState.isOutline = !zeroState.isOutline;
        }
      } else {
        // Mid frequency: mixed effects, maximum randomness
        if (randomFactor < 0.6) {
          zeroState.isOutline = !zeroState.isOutline;
        }
        
        // More random opacity changes
        const opacityChoice = Math.random();
        if (opacityChoice < 0.33) {
          zeroState.opacity = 0.05 + Math.random() * 0.15; // Low opacity range
        } else if (opacityChoice < 0.66) {
          zeroState.opacity = 0.25 + Math.random() * 0.25; // Medium opacity range
        } else {
          zeroState.opacity = 0.5 + Math.random() * 0.3; // High opacity range
        }
      }

      this.updateZeroDisplay(key);
    });
  }

  private applyBeatEffect(strength: number) {
    // Add randomness: beat strength affects base change count plus random variation
    const baseChangeCount = Math.floor(strength * 25) + 8;
    const randomVariation = Math.floor(Math.random() * 12) - 6; // Random variation from -6 to +6
    const changeCount = Math.max(5, baseChangeCount + randomVariation);

    // Only apply beat effects to non-empty positions
    const nonEmptyKeys = Object.keys(this.zeroGrid).filter(key => !this.zeroGrid[key].isEmpty);

    if (nonEmptyKeys.length === 0) return;

    const keysToChange: string[] = [];
    for (let i = 0; i < changeCount && i < nonEmptyKeys.length; i++) {
      let randomKey;
      do {
        randomKey = nonEmptyKeys[Math.floor(Math.random() * nonEmptyKeys.length)];
      } while (keysToChange.includes(randomKey));
      keysToChange.push(randomKey);
    }

    keysToChange.forEach(key => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState || zeroState.isEmpty) return;

      // Randomize transition time for more organic beat effects
      const transitionDuration = 0.08 + Math.random() * 0.08; // Random between 0.08-0.16s
      const easingTypes = ['ease-out', 'ease-in-out', 'ease-in', 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'];
      const randomEasing = easingTypes[Math.floor(Math.random() * easingTypes.length)];
      zeroState.element.style.transition = `color ${transitionDuration}s ${randomEasing}, -webkit-text-stroke ${transitionDuration}s ${randomEasing}, opacity ${transitionDuration}s ${randomEasing}`;

      // Create multiple random beat reaction patterns
      const beatPattern = Math.random();
      const intensityMultiplier = 0.3 + Math.random() * 0.7; // Random intensity multiplier 0.3-1.0
      
      if (beatPattern < 0.4) {
        // Pattern 1: Pure opacity flicker (40% chance)
        const opacityBoost = strength * intensityMultiplier * 0.6;
        const randomBoost = Math.random() * 0.3; // Additional random boost
        zeroState.opacity = Math.min(0.9, zeroState.opacity + opacityBoost + randomBoost);
        
      } else if (beatPattern < 0.7) {
        // Pattern 2: Opacity + outline switching (30% chance)
        const opacityBoost = strength * intensityMultiplier * 0.4;
        const randomBoost = Math.random() * 0.25;
        zeroState.opacity = Math.min(0.85, zeroState.opacity + opacityBoost + randomBoost);
        
        // 50% chance to switch outline
        if (Math.random() < 0.5) {
          zeroState.isOutline = !zeroState.isOutline;
        }
        
      } else if (beatPattern < 0.85) {
        // Pattern 3: Random opacity setting (15% chance)
        const randomOpacity = Math.random();
        if (randomOpacity < 0.3) {
          zeroState.opacity = 0.6 + Math.random() * 0.3; // Bright
        } else if (randomOpacity < 0.6) {
          zeroState.opacity = 0.3 + Math.random() * 0.3; // Medium
        } else {
          zeroState.opacity = 0.1 + Math.random() * 0.2; // Dim
        }
        
      } else {
        // Pattern 4: Extreme reaction (15% chance) - creates dramatic effects
        if (Math.random() < 0.5) {
          // Extremely bright
          zeroState.opacity = 0.8 + Math.random() * 0.2;
          zeroState.isOutline = Math.random() < 0.3; // 30% chance to become outline
        } else {
          // Extremely dark with quick recovery
          zeroState.opacity = 0.02 + Math.random() * 0.08;
          
          // Delayed recovery effect
          setTimeout(() => {
            if (this.zeroGrid[key]) {
              this.zeroGrid[key].opacity = 0.4 + Math.random() * 0.3;
              this.updateZeroDisplay(key);
            }
          }, 50 + Math.random() * 100); // 50-150ms delay
        }
      }

      this.updateZeroDisplay(key);
    });
  }

  private resetTransitionStyles() {
    if (!this.audioReactiveState.transientActive && !this.audioReactiveState.beatActive) {
      Object.values(this.zeroGrid).forEach(zeroState => {
        // Only reset transition styles for non-empty positions
        if (!zeroState.isEmpty) {
          zeroState.element.style.transition = 'color 1.5s ease-in-out, -webkit-text-stroke 1.5s ease-in-out, opacity 1.2s ease-in-out';
          // Reapply correct gradient color
          const gradientColor = this.calculateGradientColor(zeroState.element);
          this.updateElementStyle(zeroState.element, zeroState.isOutline, gradientColor, this.numbersVisible ? zeroState.opacity : 0);
        }
      });
    }
  }

  private updateAllZerosVisibility() {
    Object.keys(this.zeroGrid).forEach(key => {
      this.updateZeroDisplay(key);
    });
  }

  private updateAllZerosContent() {
    const displayNumber = this.currentTrack ? this.currentTrackIndex.toString() : '0';
    Object.values(this.zeroGrid).forEach(zeroState => {
      // Only update content for non-empty positions
      if (!zeroState.isEmpty) {
        zeroState.element.textContent = displayNumber;
      }
    });
  }

  // Helper method: preserve current states for resize recovery
  private preserveCurrentStates(): { [key: string]: { isOutline: boolean; opacity: number; isEmpty: boolean } } {
    const states: { [key: string]: { isOutline: boolean; opacity: number; isEmpty: boolean } } = {};
    
    Object.keys(this.zeroGrid).forEach(key => {
      const zeroState = this.zeroGrid[key];
      states[key] = {
        isOutline: zeroState.isOutline,
        opacity: zeroState.opacity,
        isEmpty: zeroState.isEmpty,
      };
    });
    
    return states;
  }

  // Helper method: get existing empty positions
  private getExistingEmptyPositions(oldGrid: { [key: string]: ZeroState }, newRows: number, newCols: number): Set<number> {
    const emptyPositions = new Set<number>();
    
    // Traverse old grid, find empty positions, and try to map to new grid
    Object.keys(oldGrid).forEach(key => {
      if (oldGrid[key].isEmpty) {
        const [rowStr, colStr] = key.split('-');
        const row = parseInt(rowStr);
        const col = parseInt(colStr);
        
        // If old position is within new grid bounds, keep it empty
        if (row < newRows && col < newCols) {
          const positionIndex = row * newCols + col;
          emptyPositions.add(positionIndex);
        }
      }
    });
    
    return emptyPositions;
  }

  // Helper method: redistribute empty positions
  private redistributeEmptyPositions(existingEmptyPositions: Set<number>, totalPositions: number, targetEmptyCount: number): Set<number> {
    const emptyPositions = new Set(existingEmptyPositions);
    
    // If too few empty positions exist, add more
    while (emptyPositions.size < targetEmptyCount) {
      const randomIndex = Math.floor(Math.random() * totalPositions);
      emptyPositions.add(randomIndex);
    }
    
    // If too many empty positions exist, randomly remove some
    while (emptyPositions.size > targetEmptyCount) {
      const positionsArray = Array.from(emptyPositions);
      const randomIndex = Math.floor(Math.random() * positionsArray.length);
      emptyPositions.delete(positionsArray[randomIndex]);
    }
    
    return emptyPositions;
  }

  // Helper method: create element with specified state
  private createZeroElementWithState(
    key: string, 
    x: number, 
    y: number, 
    startY: number, 
    endY: number, 
    isEmpty: boolean, 
    isOutline: boolean, 
    opacity: number, 
    displayNumber: string
  ) {
    if (!this.container) return;

    const element = document.createElement('div');
    const normalizedY = (y - startY) / (endY - startY);
    const bottomGray = 0x33;
    const topGray = 0x11;
    const grayValue = Math.round(topGray + (bottomGray - topGray) * normalizedY);
    const hexGray = grayValue.toString(16).padStart(2, '0');
    const zeroColor = `#${hexGray}${hexGray}${hexGray}`;

    // Set styles
    element.style.position = 'absolute';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.fontSize = `${this.FONT_SIZE}px`;
    element.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    element.style.fontWeight = '900';
    element.style.userSelect = 'none';
    element.style.pointerEvents = 'none';
    element.style.opacity = '0'; // Initially hidden, will update based on visibility state later
    element.style.transition = 'color 1.5s ease-in-out, -webkit-text-stroke 1.5s ease-in-out, opacity 1.2s ease-in-out';

    this.updateElementStyle(element, isOutline, zeroColor, 0);

    // Set content
    if (!isEmpty) {
      element.textContent = displayNumber;
    } else {
      element.textContent = '';
    }

    this.container.appendChild(element);

    this.zeroGrid[key] = {
      isOutline,
      opacity,
      element,
      isEmpty,
    };
  }

  // Public method: handle window resize
  public handleResize() {
    if (!this.container) return;

    // Preserve current state
    const previousStates = this.preserveCurrentStates();
    const wasVisible = this.numbersVisible;
    const currentDisplayNumber = this.currentTrack ? this.currentTrackIndex.toString() : '0';

    // Get new viewport dimensions
    const { width, height } = this.getViewportDimensions();
    
    // Clear existing elements but preserve state
    this.container.innerHTML = '';
    const oldGrid = { ...this.zeroGrid };
    this.zeroGrid = {};

    // Recalculate grid
    const startX = -this.OVERFLOW;
    const endX = width + this.OVERFLOW;
    const startY = -this.OVERFLOW;
    const endY = height + this.OVERFLOW;

    const cols = Math.ceil((endX - startX) / this.SPACING);
    const rows = Math.ceil((endY - startY) / this.SPACING);

    // Calculate total positions and required empty positions
    const totalPositions = rows * cols;
    const emptyPositionsCount = Math.floor(totalPositions * this.MIN_EMPTY_PERCENTAGE);

    // Try to maintain existing empty position patterns or generate new ones
    const existingEmptyPositions = this.getExistingEmptyPositions(oldGrid, rows, cols);
    const emptyPositions = this.redistributeEmptyPositions(existingEmptyPositions, totalPositions, emptyPositionsCount);

    // Regenerate grid while preserving existing states as much as possible
    let positionIndex = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * this.SPACING;
        const y = startY + row * this.SPACING;
        const zeroKey = `${row}-${col}`;
        const isEmpty = emptyPositions.has(positionIndex);

        // Try to restore from previous state
        const previousState = previousStates[zeroKey];
        const isOutline = previousState?.isOutline ?? Math.random() < 0.5;
        const opacity = previousState?.opacity ?? 0.25;

        this.createZeroElementWithState(zeroKey, x, y, startY, endY, isEmpty, isOutline, opacity, currentDisplayNumber);
        positionIndex++;
      }
    }

    // Restore visibility state
    this.numbersVisible = wasVisible;
    this.updateAllZerosVisibility();
  }

  // Public method: cleanup resources
  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.transientTimeoutId) {
      clearTimeout(this.transientTimeoutId);
    }
    if (this.beatTimeoutId) {
      clearTimeout(this.beatTimeoutId);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.zeroGrid = {};
  }
}

export default BackgroundNumbersManager;
