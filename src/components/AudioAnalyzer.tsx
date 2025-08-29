import { useEffect, useRef, useCallback } from 'react';
import { PlayState } from '../constants/playlist';

interface AudioAnalyzerProps {
  audioElement: HTMLAudioElement | null;
  playState: PlayState;
  onTransientDetected: (intensity: number, frequency: 'low' | 'mid' | 'high') => void;
  onBeatDetected: (strength: number) => void;
}

interface AnalysisData {
  rms: number;
  spectralCentroid: number;
  spectralFlux: number;
  beatStrength: number;
  dominantFrequency: 'low' | 'mid' | 'high';
}

const AudioAnalyzer = ({
  audioElement,
  playState,
  onTransientDetected,
  onBeatDetected,
}: AudioAnalyzerProps) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // 分析数据缓存
  const frequencyDataRef = useRef<Uint8Array | null>(null);
  const previousFrequencyDataRef = useRef<Uint8Array | null>(null);
  const timeDataRef = useRef<Uint8Array | null>(null);
  
  // 瞬态检测参数
  const transientThresholdRef = useRef(0.3);
  const lastTransientTimeRef = useRef(0);
  const transientCooldownRef = useRef(100); // 最小间隔时间（毫秒）
  
  // 节拍检测参数
  const beatHistoryRef = useRef<number[]>([]);
  const beatThresholdRef = useRef(0.4);
  const lastBeatTimeRef = useRef(0);
  const beatCooldownRef = useRef(150); // 节拍检测冷却时间
  
  // 平滑参数
  const smoothingFactorRef = useRef(0.8);

  // 初始化音频上下文和分析器
  const initializeAudioAnalysis = useCallback(async () => {
    if (!audioElement || audioContextRef.current) return;

    try {
      // 创建音频上下文
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 创建分析器节点
      analyzerRef.current = audioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 2048; // 更高的分辨率用于更精确的分析
      analyzerRef.current.smoothingTimeConstant = 0.3; // 适中的平滑
      analyzerRef.current.minDecibels = -90;
      analyzerRef.current.maxDecibels = -10;

      // 创建音频源节点
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioElement);
      
      // 连接节点：音频源 -> 分析器 -> 目标（扬声器）
      sourceRef.current.connect(analyzerRef.current);
      analyzerRef.current.connect(audioContextRef.current.destination);

      // 初始化数据数组
      const bufferLength = analyzerRef.current.frequencyBinCount;
      frequencyDataRef.current = new Uint8Array(bufferLength);
      previousFrequencyDataRef.current = new Uint8Array(bufferLength);
      timeDataRef.current = new Uint8Array(bufferLength);

      console.log('音频分析器初始化成功');
    } catch (error) {
      console.error('音频分析器初始化失败:', error);
    }
  }, [audioElement]);

  // 计算 RMS（均方根）- 用于音量检测
  const calculateRMS = useCallback((timeData: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const normalized = (timeData[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / timeData.length);
  }, []);

  // 计算频谱质心 - 用于音色分析
  const calculateSpectralCentroid = useCallback((frequencyData: Uint8Array): number => {
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < frequencyData.length; i++) {
      const magnitude = frequencyData[i];
      weightedSum += i * magnitude;
      magnitudeSum += magnitude;
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }, []);

  // 计算频谱流量 - 用于瞬态检测
  const calculateSpectralFlux = useCallback((
    currentData: Uint8Array,
    previousData: Uint8Array
  ): number => {
    let flux = 0;
    for (let i = 0; i < currentData.length; i++) {
      const diff = currentData[i] - previousData[i];
      flux += diff > 0 ? diff : 0; // 只考虑增加的能量
    }
    return flux / currentData.length;
  }, []);

  // 检测主导频率范围
  const getDominantFrequencyRange = useCallback((frequencyData: Uint8Array): 'low' | 'mid' | 'high' => {
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
  }, []);

  // 节拍检测算法
  const detectBeat = useCallback((rms: number, spectralFlux: number): number => {
    const now = Date.now();
    
    // 合成节拍强度指标
    const beatStrength = (rms * 0.6 + spectralFlux * 0.4);
    
    // 维护节拍历史用于自适应阈值
    beatHistoryRef.current.push(beatStrength);
    if (beatHistoryRef.current.length > 20) {
      beatHistoryRef.current.shift();
    }

    // 计算动态阈值
    const avgBeatStrength = beatHistoryRef.current.reduce((a, b) => a + b, 0) / beatHistoryRef.current.length;
    const dynamicThreshold = avgBeatStrength * 1.5; // 1.5倍平均值作为阈值

    // 检测节拍
    if (
      beatStrength > Math.max(beatThresholdRef.current, dynamicThreshold) &&
      now - lastBeatTimeRef.current > beatCooldownRef.current
    ) {
      lastBeatTimeRef.current = now;
      return beatStrength;
    }

    return 0;
  }, []);

  // 瞬态检测算法
  const detectTransient = useCallback((
    rms: number,
    spectralFlux: number,
    dominantFreq: 'low' | 'mid' | 'high'
  ): number => {
    const now = Date.now();
    
    // 瞬态强度计算：结合 RMS 突变和频谱流量
    const transientIntensity = Math.min(rms + spectralFlux * 0.5, 1.0);
    
    // 检测瞬态
    if (
      transientIntensity > transientThresholdRef.current &&
      now - lastTransientTimeRef.current > transientCooldownRef.current
    ) {
      lastTransientTimeRef.current = now;
      return transientIntensity;
    }

    return 0;
  }, []);

  // 主分析循环 - 移除依赖项以避免无限重新渲染
  const analyzeAudio = useCallback(() => {
    if (
      !analyzerRef.current ||
      !frequencyDataRef.current ||
      !previousFrequencyDataRef.current ||
      !timeDataRef.current ||
      playState !== PlayState.PLAYING
    ) {
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      return;
    }

    // 获取音频数据
    analyzerRef.current.getByteFrequencyData(frequencyDataRef.current);
    analyzerRef.current.getByteTimeDomainData(timeDataRef.current);

    // 计算分析指标
    const rms = calculateRMS(timeDataRef.current);
    const spectralCentroid = calculateSpectralCentroid(frequencyDataRef.current);
    const spectralFlux = calculateSpectralFlux(frequencyDataRef.current, previousFrequencyDataRef.current);
    const dominantFreq = getDominantFrequencyRange(frequencyDataRef.current);

    // 检测节拍
    const beatStrength = detectBeat(rms, spectralFlux);
    if (beatStrength > 0) {
      onBeatDetected(beatStrength);
    }

    // 检测瞬态
    const transientIntensity = detectTransient(rms, spectralFlux, dominantFreq);
    if (transientIntensity > 0) {
      onTransientDetected(transientIntensity, dominantFreq);
    }

    // 保存当前数据作为下一帧的"上一帧"数据
    previousFrequencyDataRef.current.set(frequencyDataRef.current);

    // 继续分析
    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [playState]);

  // 开始/停止分析
  useEffect(() => {
    if (playState === PlayState.PLAYING && audioContextRef.current) {
      // 恢复音频上下文（某些浏览器需要用户交互后才能启动）
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      
      // 开始分析
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    } else {
      // 停止分析
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [playState, analyzeAudio]);

  // 初始化音频分析
  useEffect(() => {
    if (audioElement) {
      initializeAudioAnalysis();
    }

    return () => {
      // 清理资源
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [audioElement]); // 移除initializeAudioAnalysis依赖，避免循环

  // 导出分析器控制方法到全局（用于调试）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).audioAnalyzer = {
        setTransientThreshold: (value: number) => {
          transientThresholdRef.current = Math.max(0, Math.min(1, value));
        },
        setBeatThreshold: (value: number) => {
          beatThresholdRef.current = Math.max(0, Math.min(1, value));
        },
        setTransientCooldown: (ms: number) => {
          transientCooldownRef.current = Math.max(50, ms);
        },
        setBeatCooldown: (ms: number) => {
          beatCooldownRef.current = Math.max(50, ms);
        },
        getStatus: () => ({
          isActive: playState === PlayState.PLAYING && !!audioContextRef.current,
          audioContext: audioContextRef.current?.state,
          transientThreshold: transientThresholdRef.current,
          beatThreshold: beatThresholdRef.current,
        }),
      };
    }
  }, [playState]);

  // 这个组件不渲染任何内容，只处理音频分析
  return null;
};

export default AudioAnalyzer;
