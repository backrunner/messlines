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

  // Web Worker for heavy computations
  private worker: Worker | null = null;
  private workerReady = false;

  // Transient detection parameters
  private transientThreshold = 0.3;
  private beatThreshold = 0.4;
  private transientCooldown = 100;
  private beatCooldown = 150;

  // State
  private playState: PlayState = PlayState.STOPPED;
  private callbacks: AudioAnalyzerCallbacks | null = null;

  constructor(callbacks?: AudioAnalyzerCallbacks) {
    this.callbacks = callbacks || null;
    this.setupGlobalControls();
    this.initializeWorker();
  }

  private async initializeWorker() {
    try {
      this.worker = new Worker(
        new URL('./AudioAnalyzerWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle worker messages
      this.worker.onmessage = (event: MessageEvent) => {
        if (event.data.type === 'ready') {
          // Worker is ready to receive messages
          this.workerReady = true;
          console.log('✅ Audio analyzer worker is ready');
        } else if (event.data.type === 'result') {
          const result = event.data.data;

          // Dispatch callbacks if detected
          if (result.beatStrength > 0 && this.callbacks) {
            this.callbacks.onBeatDetected(result.beatStrength);
          }

          if (result.transientIntensity > 0 && this.callbacks) {
            this.callbacks.onTransientDetected(result.transientIntensity, result.dominantFreq);
          }
        }
      };

      this.worker.onerror = (error) => {
        console.error('❌ Audio analyzer worker error:', error);
        console.error('Error details:', {
          message: error.message,
          filename: error.filename,
          lineno: error.lineno,
          colno: error.colno
        });
        this.workerReady = false;
      };
    } catch (error) {
      console.error('❌ Failed to initialize audio analyzer worker:', error);
      this.workerReady = false;
    }
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

  // Main analysis loop - transfers data to Web Worker for processing
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

    // Send data to worker for heavy computations
    if (this.worker && this.workerReady) {
      // Clone arrays to send to worker
      const frequencyDataCopy = new Uint8Array(this.frequencyData);
      const previousDataCopy = new Uint8Array(this.previousFrequencyData);
      const timeDataCopy = new Uint8Array(this.timeData);

      this.worker.postMessage({
        type: 'analyze',
        data: {
          frequencyData: frequencyDataCopy,
          previousFrequencyData: previousDataCopy,
          timeData: timeDataCopy,
          timestamp: Date.now(),
        }
      });
    }

    // Save current data as "previous" for next frame
    this.previousFrequencyData.set(this.frequencyData);

    this.animationFrameId = requestAnimationFrame(this.analyzeAudio);
  };

  // Set up global debug controls - parameters are sent to worker
  private setupGlobalControls() {
    if (typeof window !== 'undefined') {
      window.pureAudioAnalyzer = {
        setTransientThreshold: (value: number) => {
          this.transientThreshold = Math.max(0, Math.min(1, value));
          this.updateWorkerParams();
        },
        setBeatThreshold: (value: number) => {
          this.beatThreshold = Math.max(0, Math.min(1, value));
          this.updateWorkerParams();
        },
        setTransientCooldown: (ms: number) => {
          this.transientCooldown = Math.max(50, ms);
          this.updateWorkerParams();
        },
        setBeatCooldown: (ms: number) => {
          this.beatCooldown = Math.max(50, ms);
          this.updateWorkerParams();
        },
        getStatus: () => ({
          isActive: this.playState === PlayState.PLAYING && !!this.audioContext,
          audioContext: this.audioContext?.state,
          transientThreshold: this.transientThreshold,
          beatThreshold: this.beatThreshold,
          playState: this.playState,
          workerReady: this.workerReady,
        }),
      };
    }
  }

  private updateWorkerParams() {
    if (this.worker && this.workerReady) {
      this.worker.postMessage({
        type: 'updateParams',
        data: {
          transientThreshold: this.transientThreshold,
          beatThreshold: this.beatThreshold,
          transientCooldown: this.transientCooldown,
          beatCooldown: this.beatCooldown,
        }
      });
    }
  }

  private cleanup() {
    this.stopAnalysis();

    // Don't terminate worker - it can be reused across tracks
    // Worker is only terminated in destroy()

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

    // Terminate worker only on destroy
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }

    if (typeof window !== 'undefined') {
      delete window.pureAudioAnalyzer;
    }
  }
}

export default PureAudioAnalyzer;
