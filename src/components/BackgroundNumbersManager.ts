/**
 * 高性能背景数字管理器
 * 直接操作DOM，避免React重新渲染导致的性能问题
 */

interface ZeroState {
  isOutline: boolean;
  opacity: number;
  element: HTMLDivElement;
  isEmpty: boolean; // 新增：标记位置是否为空
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

  // 配置常量
  private readonly FONT_SIZE = 120;
  private readonly SPACING = this.FONT_SIZE * 0.8;
  private readonly OVERFLOW = this.FONT_SIZE;
  private readonly MIN_EMPTY_PERCENTAGE = 0.1; // 至少10%的位置为空

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

    // 清除现有元素
    this.container.innerHTML = '';
    this.zeroGrid = {};

    // 计算网格范围
    const startX = -this.OVERFLOW;
    const endX = width + this.OVERFLOW;
    const startY = -this.OVERFLOW;
    const endY = height + this.OVERFLOW;

    const cols = Math.ceil((endX - startX) / this.SPACING);
    const rows = Math.ceil((endY - startY) / this.SPACING);

    // 计算总位置数和需要空着的位置数
    const totalPositions = rows * cols;
    const emptyPositionsCount = Math.floor(totalPositions * this.MIN_EMPTY_PERCENTAGE);

    // 生成随机空位置索引
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

    // 初始状态
    const isOutline = Math.random() < 0.5;
    const opacity = 0.25; // 调整初始透明度为更适中的值

    // 设置样式
    element.style.position = 'absolute';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.fontSize = `${this.FONT_SIZE}px`;
    element.style.fontFamily = 'Arial Black, sans-serif';
    element.style.fontWeight = '900';
    element.style.userSelect = 'none';
    element.style.pointerEvents = 'none';
    element.style.opacity = '0'; // 初始隐藏
    element.style.transition = 'color 1.5s ease-in-out, -webkit-text-stroke 1.5s ease-in-out, opacity 1.2s ease-in-out';

    this.updateElementStyle(element, isOutline, zeroColor, 0);

    // 如果不是空位置，显示当前音轨索引
    if (!isEmpty) {
      const displayNumber = this.currentTrack ? this.currentTrackIndex.toString() : '0';
      element.textContent = displayNumber;
    } else {
      element.textContent = ''; // 空位置不显示内容
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

    // 获取元素在视口中的位置
    const elementTop = parseFloat(element.style.top);
    const elementY = elementTop + this.OVERFLOW; // 调整偏移量

    // 计算渐变范围
    const startY = -this.OVERFLOW;
    const endY = height + this.OVERFLOW;

    // 计算归一化的Y位置 (0在顶部，1在底部)
    const normalizedY = Math.max(0, Math.min(1, (elementY - startY) / (endY - startY)));

    // 渐变颜色计算：顶部较深 (#111)，底部较浅 (#333)
    const bottomGray = 0x33; // #333
    const topGray = 0x11;    // #111
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
    
    // 随机化初始间隔，避免所有更新同时触发
    let outlineInterval = 7000 + Math.random() * 3000; // 7-10秒随机间隔
    let fadeInterval = 2500 + Math.random() * 2000;    // 2.5-4.5秒随机间隔
    let emptyPositionInterval = 9000 + Math.random() * 4000; // 9-13秒随机间隔

    const update = (now: number) => {
      // 随机间隔的轮廓切换
      if (now - lastOutlineUpdate > outlineInterval) {
        this.randomOutlineUpdate();
        lastOutlineUpdate = now;
        // 重新随机化下次间隔
        outlineInterval = 6000 + Math.random() * 4000; // 6-10秒
      }

      // 随机间隔的透明度变化
      if (now - lastFadeUpdate > fadeInterval) {
        this.randomFadeUpdate();
        lastFadeUpdate = now;
        // 重新随机化下次间隔
        fadeInterval = 2000 + Math.random() * 3000; // 2-5秒
      }

      // 随机间隔的空位置切换
      if (now - lastEmptyPositionUpdate > emptyPositionInterval) {
        this.randomEmptyPositionUpdate();
        lastEmptyPositionUpdate = now;
        // 重新随机化下次间隔
        emptyPositionInterval = 8000 + Math.random() * 6000; // 8-14秒
      }

      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private randomOutlineUpdate() {
    // 只对非空位置进行轮廓更新
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
    // 只对非空位置进行透明度更新
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

      // 增加透明度变化的随机性和多样性
      const opacityPattern = Math.random();
      
      if (opacityPattern < 0.4) {
        // 40%几率：简单明暗切换
        zeroState.opacity = zeroState.opacity > 0.25 ? 0.08 + Math.random() * 0.12 : 0.3 + Math.random() * 0.2;
      } else if (opacityPattern < 0.7) {
        // 30%几率：渐进式变化
        const currentOpacity = zeroState.opacity;
        const direction = Math.random() < 0.5 ? 1 : -1;
        const change = (Math.random() * 0.15 + 0.05) * direction;
        zeroState.opacity = Math.max(0.05, Math.min(0.6, currentOpacity + change));
      } else if (opacityPattern < 0.9) {
        // 20%几率：随机区间设置
        const randomZone = Math.random();
        if (randomZone < 0.33) {
          zeroState.opacity = 0.05 + Math.random() * 0.15; // 低区间
        } else if (randomZone < 0.66) {
          zeroState.opacity = 0.2 + Math.random() * 0.2; // 中区间
        } else {
          zeroState.opacity = 0.4 + Math.random() * 0.2; // 高区间
        }
      } else {
        // 10%几率：极端值
        zeroState.opacity = Math.random() < 0.5 ? 0.02 + Math.random() * 0.08 : 0.5 + Math.random() * 0.3;
      }

      this.updateZeroDisplay(key);
    });
  }

  // 新增：随机切换空位置的方法
  private randomEmptyPositionUpdate() {
    const allKeys = Object.keys(this.zeroGrid);
    if (allKeys.length === 0) return;

    const totalPositions = allKeys.length;
    const targetEmptyCount = Math.floor(totalPositions * this.MIN_EMPTY_PERCENTAGE);
    const currentEmptyKeys = allKeys.filter(key => this.zeroGrid[key].isEmpty);
    const currentNonEmptyKeys = allKeys.filter(key => !this.zeroGrid[key].isEmpty);

    // 计算需要调整的位置数量（随机切换一部分空位置）
    const switchCount = Math.floor(Math.random() * Math.min(5, targetEmptyCount / 2)) + 1; // 1-5个位置

    // 随机选择一些空位置变成非空
    const emptyKeysToFill: string[] = [];
    for (let i = 0; i < switchCount && i < currentEmptyKeys.length; i++) {
      let randomKey;
      do {
        randomKey = currentEmptyKeys[Math.floor(Math.random() * currentEmptyKeys.length)];
      } while (emptyKeysToFill.includes(randomKey));
      emptyKeysToFill.push(randomKey);
    }

    // 随机选择一些非空位置变成空
    const nonEmptyKeysToEmpty: string[] = [];
    for (let i = 0; i < switchCount && i < currentNonEmptyKeys.length; i++) {
      let randomKey;
      do {
        randomKey = currentNonEmptyKeys[Math.floor(Math.random() * currentNonEmptyKeys.length)];
      } while (nonEmptyKeysToEmpty.includes(randomKey));
      nonEmptyKeysToEmpty.push(randomKey);
    }

    // 执行切换
    emptyKeysToFill.forEach(key => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState) return;

      zeroState.isEmpty = false;
      // 设置为显示数字
      const displayNumber = this.currentTrack ? this.currentTrackIndex.toString() : '0';
      zeroState.element.textContent = displayNumber;
      this.updateZeroDisplay(key);
    });

    nonEmptyKeysToEmpty.forEach(key => {
      const zeroState = this.zeroGrid[key];
      if (!zeroState) return;

      zeroState.isEmpty = true;
      // 清空显示内容
      zeroState.element.textContent = '';
      // 立即隐藏
      zeroState.element.style.opacity = '0';
    });
  }

  private updateZeroDisplay(key: string) {
    const zeroState = this.zeroGrid[key];
    if (!zeroState) return;

    const element = zeroState.element;

    // 如果是空位置，始终隐藏
    if (zeroState.isEmpty) {
      element.style.opacity = '0';
      return;
    }

    const finalOpacity = this.numbersVisible ? zeroState.opacity : 0;

    // 重新计算基于位置的渐变颜色
    const gradientColor = this.calculateGradientColor(element);

    this.updateElementStyle(element, zeroState.isOutline, gradientColor, finalOpacity);
  }

  // 公共方法：设置音乐播放状态
  public setPlayState(isPlaying: boolean) {
    if (isPlaying && !this.numbersVisible) {
      // 延迟淡入
      setTimeout(() => {
        this.numbersVisible = true;
        this.updateAllZerosVisibility();
      }, 500);
    } else if (!isPlaying && this.numbersVisible) {
      // 立即淡出
      this.numbersVisible = false;
      this.updateAllZerosVisibility();
    }
  }

  // 公共方法：设置当前音轨
  public setCurrentTrack(track: any, trackIndex: number) {
    this.currentTrack = track;
    this.currentTrackIndex = trackIndex;
    this.updateAllZerosContent();
  }

  // 公共方法：处理音频瞬态
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

  // 公共方法：处理音频节拍
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
    // 添加随机性：瞬态强度影响变化数量，但加入随机波动
    const baseChangeCount = Math.floor(intensity * 30) + 5;
    const randomVariation = Math.floor(Math.random() * 10) - 5; // -5到+5的随机变化
    const changeCount = Math.max(3, baseChangeCount + randomVariation);
    
    // 只对非空位置应用瞬态效果
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

      // 随机化过渡时间，创造更自然的效果
      const transitionDuration = 0.08 + Math.random() * 0.04; // 0.08-0.12s之间随机
      zeroState.element.style.transition = `color ${transitionDuration}s ease-out, -webkit-text-stroke ${transitionDuration}s ease-out, opacity ${transitionDuration}s ease-out`;

      // 根据频率类型应用不同的随机效果
      const randomFactor = Math.random(); // 0-1的随机因子
      
      if (frequency === 'low') {
        // 低频：偏向轮廓切换，但加入透明度随机变化
        if (randomFactor < 0.7) {
          zeroState.isOutline = !zeroState.isOutline;
        }
        if (randomFactor < 0.4) {
          // 40%几率同时改变透明度
          zeroState.opacity = 0.05 + Math.random() * 0.35; // 0.05-0.4之间随机
        }
      } else if (frequency === 'high') {
        // 高频：主要影响透明度，更加闪烁
        const opacityRandomness = Math.random() * 0.3; // 0-0.3的随机加成
        if (zeroState.opacity > 0.15) {
          zeroState.opacity = Math.max(0.02, 0.05 - opacityRandomness); // 变暗，但有随机性
        } else {
          zeroState.opacity = Math.min(0.8, 0.6 + opacityRandomness); // 变亮，但有随机性
        }
        
        // 30%几率同时切换轮廓
        if (randomFactor < 0.3) {
          zeroState.isOutline = !zeroState.isOutline;
        }
      } else {
        // 中频：混合效果，最大随机性
        if (randomFactor < 0.6) {
          zeroState.isOutline = !zeroState.isOutline;
        }
        
        // 透明度变化更加随机
        const opacityChoice = Math.random();
        if (opacityChoice < 0.33) {
          zeroState.opacity = 0.05 + Math.random() * 0.15; // 低透明度区间
        } else if (opacityChoice < 0.66) {
          zeroState.opacity = 0.25 + Math.random() * 0.25; // 中透明度区间
        } else {
          zeroState.opacity = 0.5 + Math.random() * 0.3; // 高透明度区间
        }
      }

      this.updateZeroDisplay(key);
    });
  }

  private applyBeatEffect(strength: number) {
    // 添加随机性：节拍强度影响基础变化数量，再加上随机波动
    const baseChangeCount = Math.floor(strength * 25) + 8;
    const randomVariation = Math.floor(Math.random() * 12) - 6; // -6到+6的随机变化
    const changeCount = Math.max(5, baseChangeCount + randomVariation);
    
    // 只对非空位置应用节拍效果
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

      // 随机化过渡时间，创造更有机的节拍效果
      const transitionDuration = 0.08 + Math.random() * 0.08; // 0.08-0.16s之间随机
      const easingTypes = ['ease-out', 'ease-in-out', 'ease-in', 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'];
      const randomEasing = easingTypes[Math.floor(Math.random() * easingTypes.length)];
      zeroState.element.style.transition = `color ${transitionDuration}s ${randomEasing}, -webkit-text-stroke ${transitionDuration}s ${randomEasing}, opacity ${transitionDuration}s ${randomEasing}`;

      // 创建多种随机的节拍反应模式
      const beatPattern = Math.random();
      const intensityMultiplier = 0.3 + Math.random() * 0.7; // 0.3-1.0的随机强度倍数
      
      if (beatPattern < 0.4) {
        // 模式1：纯透明度闪烁（40%几率）
        const opacityBoost = strength * intensityMultiplier * 0.6;
        const randomBoost = Math.random() * 0.3; // 额外随机增强
        zeroState.opacity = Math.min(0.9, zeroState.opacity + opacityBoost + randomBoost);
        
      } else if (beatPattern < 0.7) {
        // 模式2：透明度+轮廓切换（30%几率）
        const opacityBoost = strength * intensityMultiplier * 0.4;
        const randomBoost = Math.random() * 0.25;
        zeroState.opacity = Math.min(0.85, zeroState.opacity + opacityBoost + randomBoost);
        
        // 50%几率切换轮廓
        if (Math.random() < 0.5) {
          zeroState.isOutline = !zeroState.isOutline;
        }
        
      } else if (beatPattern < 0.85) {
        // 模式3：随机透明度设置（15%几率）
        const randomOpacity = Math.random();
        if (randomOpacity < 0.3) {
          zeroState.opacity = 0.6 + Math.random() * 0.3; // 高亮
        } else if (randomOpacity < 0.6) {
          zeroState.opacity = 0.3 + Math.random() * 0.3; // 中等
        } else {
          zeroState.opacity = 0.1 + Math.random() * 0.2; // 暗淡
        }
        
      } else {
        // 模式4：极端反应（15%几率）- 创造戏剧性效果
        if (Math.random() < 0.5) {
          // 极亮
          zeroState.opacity = 0.8 + Math.random() * 0.2;
          zeroState.isOutline = Math.random() < 0.3; // 30%几率变轮廓
        } else {
          // 极暗后快速恢复
          zeroState.opacity = 0.02 + Math.random() * 0.08;
          
          // 延迟恢复效果
          setTimeout(() => {
            if (this.zeroGrid[key]) {
              this.zeroGrid[key].opacity = 0.4 + Math.random() * 0.3;
              this.updateZeroDisplay(key);
            }
          }, 50 + Math.random() * 100); // 50-150ms延迟
        }
      }

      this.updateZeroDisplay(key);
    });
  }

  private resetTransitionStyles() {
    if (!this.audioReactiveState.transientActive && !this.audioReactiveState.beatActive) {
      Object.values(this.zeroGrid).forEach(zeroState => {
        // 只重置非空位置的过渡样式
        if (!zeroState.isEmpty) {
          zeroState.element.style.transition = 'color 1.5s ease-in-out, -webkit-text-stroke 1.5s ease-in-out, opacity 1.2s ease-in-out';
          // 重新应用正确的渐变颜色
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
      // 只更新非空位置的内容
      if (!zeroState.isEmpty) {
        zeroState.element.textContent = displayNumber;
      }
    });
  }

  // 辅助方法：保存当前状态以便在resize时恢复
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

  // 辅助方法：获取现有的空位置
  private getExistingEmptyPositions(oldGrid: { [key: string]: ZeroState }, newRows: number, newCols: number): Set<number> {
    const emptyPositions = new Set<number>();
    
    // 遍历旧网格，找出空位置，并尝试映射到新网格
    Object.keys(oldGrid).forEach(key => {
      if (oldGrid[key].isEmpty) {
        const [rowStr, colStr] = key.split('-');
        const row = parseInt(rowStr);
        const col = parseInt(colStr);
        
        // 如果旧位置在新网格范围内，保持为空
        if (row < newRows && col < newCols) {
          const positionIndex = row * newCols + col;
          emptyPositions.add(positionIndex);
        }
      }
    });
    
    return emptyPositions;
  }

  // 辅助方法：重新分布空位置
  private redistributeEmptyPositions(existingEmptyPositions: Set<number>, totalPositions: number, targetEmptyCount: number): Set<number> {
    const emptyPositions = new Set(existingEmptyPositions);
    
    // 如果现有空位置太少，添加更多
    while (emptyPositions.size < targetEmptyCount) {
      const randomIndex = Math.floor(Math.random() * totalPositions);
      emptyPositions.add(randomIndex);
    }
    
    // 如果现有空位置太多，随机移除一些
    while (emptyPositions.size > targetEmptyCount) {
      const positionsArray = Array.from(emptyPositions);
      const randomIndex = Math.floor(Math.random() * positionsArray.length);
      emptyPositions.delete(positionsArray[randomIndex]);
    }
    
    return emptyPositions;
  }

  // 辅助方法：创建带有指定状态的元素
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

    // 设置样式
    element.style.position = 'absolute';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.fontSize = `${this.FONT_SIZE}px`;
    element.style.fontFamily = 'Arial Black, sans-serif';
    element.style.fontWeight = '900';
    element.style.userSelect = 'none';
    element.style.pointerEvents = 'none';
    element.style.opacity = '0'; // 初始隐藏，稍后根据可见性状态更新
    element.style.transition = 'color 1.5s ease-in-out, -webkit-text-stroke 1.5s ease-in-out, opacity 1.2s ease-in-out';

    this.updateElementStyle(element, isOutline, zeroColor, 0);

    // 设置内容
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

  // 公共方法：响应窗口大小变化
  public handleResize() {
    if (!this.container) return;

    // 保存当前状态
    const previousStates = this.preserveCurrentStates();
    const wasVisible = this.numbersVisible;
    const currentDisplayNumber = this.currentTrack ? this.currentTrackIndex.toString() : '0';

    // 获取新的视口尺寸
    const { width, height } = this.getViewportDimensions();
    
    // 清除现有元素但保留状态
    this.container.innerHTML = '';
    const oldGrid = { ...this.zeroGrid };
    this.zeroGrid = {};

    // 重新计算网格
    const startX = -this.OVERFLOW;
    const endX = width + this.OVERFLOW;
    const startY = -this.OVERFLOW;
    const endY = height + this.OVERFLOW;

    const cols = Math.ceil((endX - startX) / this.SPACING);
    const rows = Math.ceil((endY - startY) / this.SPACING);

    // 计算总位置数和需要空着的位置数
    const totalPositions = rows * cols;
    const emptyPositionsCount = Math.floor(totalPositions * this.MIN_EMPTY_PERCENTAGE);

    // 尝试保持现有的空位置模式，或生成新的
    const existingEmptyPositions = this.getExistingEmptyPositions(oldGrid, rows, cols);
    const emptyPositions = this.redistributeEmptyPositions(existingEmptyPositions, totalPositions, emptyPositionsCount);

    // 重新生成网格，尽可能保持现有状态
    let positionIndex = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * this.SPACING;
        const y = startY + row * this.SPACING;
        const zeroKey = `${row}-${col}`;
        const isEmpty = emptyPositions.has(positionIndex);

        // 尝试从之前的状态中恢复
        const previousState = previousStates[zeroKey];
        const isOutline = previousState?.isOutline ?? Math.random() < 0.5;
        const opacity = previousState?.opacity ?? 0.25;

        this.createZeroElementWithState(zeroKey, x, y, startY, endY, isEmpty, isOutline, opacity, currentDisplayNumber);
        positionIndex++;
      }
    }

    // 恢复可见性状态
    this.numbersVisible = wasVisible;
    this.updateAllZerosVisibility();
  }

  // 公共方法：清理资源
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
