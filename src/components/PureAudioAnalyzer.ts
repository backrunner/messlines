/**
 * SecStream Audio Analyzer
 * Specialized analyzer for SecStream audio contexts - SecStream only, no HTML audio fallback
 */

import { PlayState } from '../constants/playlist';

interface AudioAnalyzerCallbacks {
  onTransientDetected: (intensity: number, frequency: 'low' | 'mid' | 'high') => void;
  onBeatDetected: (strength: number) => void;
}

interface AudioAnalyzerDebugControls {
  setTransientThreshold: (value: number) => void;
  setBeatThreshold: (value: number) => void;
  setTransientCooldown: (ms: number) => void;
  setBeatCooldown: (ms: number) => void;
  getStatus: () => {
    isActive: boolean;
    audioContext: string | undefined;
    transientThreshold: number;
    beatThreshold: number;
    playState: PlayState;
  };
}

declare global {
  interface Window {
    pureAudioAnalyzer?: AudioAnalyzerDebugControls;
  }
}

class PureAudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  // Analysis data cache
  private frequencyData: Uint8Array | null = null;
  private previousFrequencyData: Uint8Array | null = null;
  private timeData: Uint8Array | null = null;

  // Transient detection parameters
  private transientThreshold = 0.3;
  private lastTransientTime = 0;
  private transientCooldown = 100; // Minimum interval time (ms)

  // Beat detection parameters
  private beatHistory: number[] = [];
  private beatThreshold = 0.4;
  private lastBeatTime = 0;
  private beatCooldown = 150; // Beat detection cooldown time

  // State
  private playState: PlayState = PlayState.STOPPED;
  private callbacks: AudioAnalyzerCallbacks | null = null;

  constructor(callbacks?: AudioAnalyzerCallbacks) {
    this.callbacks = callbacks || null;
    this.setupGlobalControls();
  }

  public setSecStreamAudioContext(audioContext: AudioContext | null) {
    if (!audioContext) {
      this.cleanup();
      return;
    }

    this.cleanup();

    try {
      this.audioContext = audioContext;

      // Note: The analyzer node is created and connected in SecStreamService
      // We just need to get it from the service through AudioManager
      console.log('✅ SecStream audio context set, waiting for analyzer node connection');
    } catch (error) {
      console.error('❌ SecStream audio analyzer initialization failed:', error);
    }
  }

  /**
   * Set the analyzer node that's already connected to the audio graph
   * This is called by AudioManager after SecStreamService connects the analyzer
   */
  public setAnalyzerNode(analyzer: AnalyserNode) {
    if (this.analyzer) {
      this.analyzer.disconnect();
    }

    this.analyzer = analyzer;
    this.audioContext = analyzer.context as AudioContext;

    // Initialize data arrays
    const bufferLength = this.analyzer.frequencyBinCount;
    this.frequencyData = new Uint8Array(bufferLength);
    this.previousFrequencyData = new Uint8Array(bufferLength);
    this.timeData = new Uint8Array(bufferLength);

    console.log('✅ Real-time audio analyzer connected to SecStream playback');
  }

  public setPlayState(playState: PlayState) {
    this.playState = playState;

    if (playState === PlayState.PLAYING && this.audioContext) {
      // Resume audio context (some browsers require user interaction before starting)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      this.startAnalysis();
    } else {
      this.stopAnalysis();
    }
  }

  public setCallbacks(callbacks: AudioAnalyzerCallbacks) {
    this.callbacks = callbacks;
  }


  private startAnalysis() {
    if (this.animationFrameId) return; // Already running

    this.analyzeAudio();
  }

  private stopAnalysis() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Main analysis loop
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

    // Get audio data for analysis
    this.analyzer.getByteFrequencyData(this.frequencyData as Uint8Array<ArrayBuffer>);
    this.analyzer.getByteTimeDomainData(this.timeData as Uint8Array<ArrayBuffer>);

    const rms = this.calculateRMS(this.timeData);
    const spectralCentroid = this.calculateSpectralCentroid(this.frequencyData);
    const spectralFlux = this.calculateSpectralFlux(this.frequencyData, this.previousFrequencyData);
    const dominantFreq = this.getDominantFrequencyRange(this.frequencyData);

    const beatStrength = this.detectBeat(rms, spectralFlux);
    if (beatStrength > 0 && this.callbacks) {
      this.callbacks.onBeatDetected(beatStrength);
    }

    const transientIntensity = this.detectTransient(rms, spectralFlux, dominantFreq);
    if (transientIntensity > 0 && this.callbacks) {
      this.callbacks.onTransientDetected(transientIntensity, dominantFreq);
    }

    // Save current data as "previous" for next frame
    this.previousFrequencyData.set(this.frequencyData);

    this.animationFrameId = requestAnimationFrame(this.analyzeAudio);
  };

  // Calculate RMS (Root Mean Square) for volume detection
  private calculateRMS(timeData: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const normalized = (timeData[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / timeData.length);
  }

  // Calculate spectral centroid for timbre analysis
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

  // Calculate spectral flux for transient detection
  private calculateSpectralFlux(currentData: Uint8Array, previousData: Uint8Array): number {
    let flux = 0;
    for (let i = 0; i < currentData.length; i++) {
      const diff = currentData[i] - previousData[i];
      flux += diff > 0 ? diff : 0; // Only consider increasing energy
    }
    return flux / currentData.length;
  }

  // Detect dominant frequency range
  private getDominantFrequencyRange(frequencyData: Uint8Array): 'low' | 'mid' | 'high' {
    const lowEnd = Math.floor(frequencyData.length * 0.1);   // Low: 0-10%
    const midEnd = Math.floor(frequencyData.length * 0.5);   // Mid: 10-50%
    // High: 50-100%

    let lowSum = 0, midSum = 0, highSum = 0;

    for (let i = 0; i < lowEnd; i++) {
      lowSum += frequencyData[i];
    }

    for (let i = lowEnd; i < midEnd; i++) {
      midSum += frequencyData[i];
    }

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

  // Beat detection algorithm
  private detectBeat(rms: number, spectralFlux: number): number {
    const now = Date.now();

    // Composite beat strength metric
    const beatStrength = (rms * 0.6 + spectralFlux * 0.4);

    // Maintain beat history for adaptive threshold
    this.beatHistory.push(beatStrength);
    if (this.beatHistory.length > 20) {
      this.beatHistory.shift();
    }

    // Calculate dynamic threshold
    const avgBeatStrength = this.beatHistory.reduce((a, b) => a + b, 0) / this.beatHistory.length;
    const dynamicThreshold = avgBeatStrength * 1.5; // 1.5x average as threshold

    if (
      beatStrength > Math.max(this.beatThreshold, dynamicThreshold) &&
      now - this.lastBeatTime > this.beatCooldown
    ) {
      this.lastBeatTime = now;
      return beatStrength;
    }

    return 0;
  }

  // Transient detection algorithm
  private detectTransient(
    rms: number,
    spectralFlux: number,
    dominantFreq: 'low' | 'mid' | 'high'
  ): number {
    const now = Date.now();

    // Transient intensity calculation: combines RMS spike and spectral flux
    const transientIntensity = Math.min(rms + spectralFlux * 0.5, 1.0);

    if (
      transientIntensity > this.transientThreshold &&
      now - this.lastTransientTime > this.transientCooldown
    ) {
      this.lastTransientTime = now;
      return transientIntensity;
    }

    return 0;
  }

  // Set up global debug controls
  private setupGlobalControls() {
    if (typeof window !== 'undefined') {
      window.pureAudioAnalyzer = {
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

  private cleanup() {
    this.stopAnalysis();

    // Don't disconnect the analyzer if it's provided externally
    // It will be managed by SecStreamService
    if (this.analyzer) {
      // Only nullify the reference, don't disconnect
      this.analyzer = null;
    }

    this.audioContext = null;
    this.frequencyData = null;
    this.previousFrequencyData = null;
    this.timeData = null;
  }

  public destroy() {
    this.cleanup();
    this.callbacks = null;

    if (typeof window !== 'undefined') {
      delete window.pureAudioAnalyzer;
    }
  }
}

export default PureAudioAnalyzer;
