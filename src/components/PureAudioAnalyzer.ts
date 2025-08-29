/**
 * 纯JavaScript音频分析器
 * 完全脱离React，直接使用Web Audio API进行实时音频分析
 */

import { PlayState } from '../constants/playlist';

interface AnalysisData {
  rms: number;
  spectralCentroid: number;
  spectralFlux: number;
  beatStrength: number;
  dominantFrequency: 'low' | 'mid' | 'high';
}

interface AudioAnalyzerCallbacks {
  onTransientDetected: (intensity: number, frequency: 'low' | 'mid' | 'high') => void;
  onBeatDetected: (strength: number) => void;
}

class PureAudioAnalyzer {
  private audioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  
  // 分析数据缓存
  private frequencyData: Uint8Array | null = null;
  private previousFrequencyData: Uint8Array | null = null;
  private timeData: Uint8Array | null = null;
  
  // 瞬态检测参数
  private transientThreshold = 0.3;
  private lastTransientTime = 0;
  private transientCooldown = 100; // 最小间隔时间（毫秒）
  
  // 节拍检测参数
  private beatHistory: number[] = [];
  private beatThreshold = 0.4;
  private lastBeatTime = 0;
  private beatCooldown = 150; // 节拍检测冷却时间
  
  // 平滑参数
  private smoothingFactor = 0.8;
  
  // 状态
  private playState: PlayState = PlayState.STOPPED;
  private callbacks: AudioAnalyzerCallbacks | null = null;

  constructor(callbacks?: AudioAnalyzerCallbacks) {
    this.callbacks = callbacks || null;
    this.setupGlobalControls();
  }

  // 设置音频元素
  public setAudioElement(audioElement: HTMLAudioElement | null) {
    if (this.audioElement === audioElement) return;
    
    // 清理旧的音频分析
    this.cleanup();
    
    this.audioElement = audioElement;
    if (audioElement) {
      this.initializeAudioAnalysis();
    }
  }

  // 设置播放状态
  public setPlayState(playState: PlayState) {
    this.playState = playState;
    
    if (playState === PlayState.PLAYING && this.audioContext) {
      // 恢复音频上下文（某些浏览器需要用户交互后才能启动）
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      // 开始分析
      this.startAnalysis();
    } else {
      // 停止分析
      this.stopAnalysis();
    }
  }

  // 设置回调函数
  public setCallbacks(callbacks: AudioAnalyzerCallbacks) {
    this.callbacks = callbacks;
  }

  // 初始化音频上下文和分析器
  private async initializeAudioAnalysis() {
    if (!this.audioElement || this.audioContext) return;

    try {
      // 创建音频上下文
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 创建分析器节点
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 2048; // 更高的分辨率用于更精确的分析
      this.analyzer.smoothingTimeConstant = 0.3; // 适中的平滑
      this.analyzer.minDecibels = -90;
      this.analyzer.maxDecibels = -10;

      // 创建音频源节点
      this.source = this.audioContext.createMediaElementSource(this.audioElement);
      
      // 连接节点：音频源 -> 分析器 -> 目标（扬声器）
      this.source.connect(this.analyzer);
      this.analyzer.connect(this.audioContext.destination);

      // 初始化数据数组
      const bufferLength = this.analyzer.frequencyBinCount;
      this.frequencyData = new Uint8Array(bufferLength);
      this.previousFrequencyData = new Uint8Array(bufferLength);
      this.timeData = new Uint8Array(bufferLength);

      console.log('纯JavaScript音频分析器初始化成功');
    } catch (error) {
      console.error('音频分析器初始化失败:', error);
    }
  }

  // 开始分析
  private startAnalysis() {
    if (this.animationFrameId) return; // 已经在运行
    
    this.analyzeAudio();
  }

  // 停止分析
  private stopAnalysis() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // 主分析循环
  private analyzeAudio = () => {
    if (
      !this.analyzer ||
      !this.frequencyData ||
      !this.previousFrequencyData ||
      !this.timeData ||
      this.playState !== PlayState.PLAYING
    ) {
      this.animationFrameId = requestAnimationFrame(this.analyzeAudio);
      return;
    }

    // 获取音频数据
    this.analyzer.getByteFrequencyData(this.frequencyData);
    this.analyzer.getByteTimeDomainData(this.timeData);

    // 计算分析指标
    const rms = this.calculateRMS(this.timeData);
    const spectralCentroid = this.calculateSpectralCentroid(this.frequencyData);
    const spectralFlux = this.calculateSpectralFlux(this.frequencyData, this.previousFrequencyData);
    const dominantFreq = this.getDominantFrequencyRange(this.frequencyData);

    // 检测节拍
    const beatStrength = this.detectBeat(rms, spectralFlux);
    if (beatStrength > 0 && this.callbacks) {
      this.callbacks.onBeatDetected(beatStrength);
    }

    // 检测瞬态
    const transientIntensity = this.detectTransient(rms, spectralFlux, dominantFreq);
    if (transientIntensity > 0 && this.callbacks) {
      this.callbacks.onTransientDetected(transientIntensity, dominantFreq);
    }

    // 保存当前数据作为下一帧的"上一帧"数据
    this.previousFrequencyData.set(this.frequencyData);

    // 继续分析
    this.animationFrameId = requestAnimationFrame(this.analyzeAudio);
  };

  // 计算 RMS（均方根）- 用于音量检测
  private calculateRMS(timeData: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const normalized = (timeData[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / timeData.length);
  }

  // 计算频谱质心 - 用于音色分析
  private calculateSpectralCentroid(frequencyData: Uint8Array): number {
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < frequencyData.length; i++) {
      const magnitude = frequencyData[i];
      weightedSum += i * magnitude;
      magnitudeSum += magnitude;
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  // 计算频谱流量 - 用于瞬态检测
  private calculateSpectralFlux(currentData: Uint8Array, previousData: Uint8Array): number {
    let flux = 0;
    for (let i = 0; i < currentData.length; i++) {
      const diff = currentData[i] - previousData[i];
      flux += diff > 0 ? diff : 0; // 只考虑增加的能量
    }
    return flux / currentData.length;
  }

  // 检测主导频率范围
  private getDominantFrequencyRange(frequencyData: Uint8Array): 'low' | 'mid' | 'high' {
    const lowEnd = Math.floor(frequencyData.length * 0.1);   // 低频：0-10%
    const midEnd = Math.floor(frequencyData.length * 0.5);   // 中频：10-50%
    // 高频：50-100%

    let lowSum = 0, midSum = 0, highSum = 0;

    // 低频范围
    for (let i = 0; i < lowEnd; i++) {
      lowSum += frequencyData[i];
    }

    // 中频范围
    for (let i = lowEnd; i < midEnd; i++) {
      midSum += frequencyData[i];
    }

    // 高频范围
    for (let i = midEnd; i < frequencyData.length; i++) {
      highSum += frequencyData[i];
    }

    const lowAvg = lowSum / lowEnd;
    const midAvg = midSum / (midEnd - lowEnd);
    const highAvg = highSum / (frequencyData.length - midEnd);

    if (lowAvg > midAvg && lowAvg > highAvg) return 'low';
    if (highAvg > midAvg && highAvg > lowAvg) return 'high';
    return 'mid';
  }

  // 节拍检测算法
  private detectBeat(rms: number, spectralFlux: number): number {
    const now = Date.now();
    
    // 合成节拍强度指标
    const beatStrength = (rms * 0.6 + spectralFlux * 0.4);
    
    // 维护节拍历史用于自适应阈值
    this.beatHistory.push(beatStrength);
    if (this.beatHistory.length > 20) {
      this.beatHistory.shift();
    }

    // 计算动态阈值
    const avgBeatStrength = this.beatHistory.reduce((a, b) => a + b, 0) / this.beatHistory.length;
    const dynamicThreshold = avgBeatStrength * 1.5; // 1.5倍平均值作为阈值

    // 检测节拍
    if (
      beatStrength > Math.max(this.beatThreshold, dynamicThreshold) &&
      now - this.lastBeatTime > this.beatCooldown
    ) {
      this.lastBeatTime = now;
      return beatStrength;
    }

    return 0;
  }

  // 瞬态检测算法
  private detectTransient(
    rms: number,
    spectralFlux: number,
    dominantFreq: 'low' | 'mid' | 'high'
  ): number {
    const now = Date.now();
    
    // 瞬态强度计算：结合 RMS 突变和频谱流量
    const transientIntensity = Math.min(rms + spectralFlux * 0.5, 1.0);
    
    // 检测瞬态
    if (
      transientIntensity > this.transientThreshold &&
      now - this.lastTransientTime > this.transientCooldown
    ) {
      this.lastTransientTime = now;
      return transientIntensity;
    }

    return 0;
  }

  // 设置全局调试控制
  private setupGlobalControls() {
    if (typeof window !== 'undefined') {
      (window as any).pureAudioAnalyzer = {
        setTransientThreshold: (value: number) => {
          this.transientThreshold = Math.max(0, Math.min(1, value));
        },
        setBeatThreshold: (value: number) => {
          this.beatThreshold = Math.max(0, Math.min(1, value));
        },
        setTransientCooldown: (ms: number) => {
          this.transientCooldown = Math.max(50, ms);
        },
        setBeatCooldown: (ms: number) => {
          this.beatCooldown = Math.max(50, ms);
        },
        getStatus: () => ({
          isActive: this.playState === PlayState.PLAYING && !!this.audioContext,
          audioContext: this.audioContext?.state,
          transientThreshold: this.transientThreshold,
          beatThreshold: this.beatThreshold,
          playState: this.playState,
        }),
      };
    }
  }

  // 清理资源
  private cleanup() {
    // 停止分析
    this.stopAnalysis();
    
    // 断开音频节点
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    // 关闭音频上下文
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // 清理数据
    this.analyzer = null;
    this.frequencyData = null;
    this.previousFrequencyData = null;
    this.timeData = null;
  }

  // 公共方法：销毁分析器
  public destroy() {
    this.cleanup();
    this.callbacks = null;
    
    // 清理全局控制
    if (typeof window !== 'undefined') {
      delete (window as any).pureAudioAnalyzer;
    }
  }
}

export default PureAudioAnalyzer;
