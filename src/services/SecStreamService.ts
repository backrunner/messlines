import { SecureAudioClient } from 'secstream/client';
import { SecureAudioPlayer } from 'secstream/client';
import { ArtistPageTransport } from '../transport/ArtistPageTransport';
import { SECSTREAM_CONFIG } from '../constants/playlist';
import type { AudioTrack } from '../constants/playlist';

export class SecStreamService {
  private client: SecureAudioClient | null = null;
  private player: SecureAudioPlayer | null = null;
  private transport: ArtistPageTransport | null = null;
  private currentSessionId: string | null = null;
  private analyzerNode: AnalyserNode | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      this.transport = new ArtistPageTransport(window.location.origin);

      this.client = new SecureAudioClient(this.transport, {
        bufferSize: SECSTREAM_CONFIG.bufferSize,
        prefetchSize: SECSTREAM_CONFIG.prefetchSize,
      });

      console.log('✅ SecStream service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize SecStream service:', error);
    }
  }

  async createSecureAudioUrl(track: AudioTrack): Promise<string> {
    if (!this.client || !this.transport || !track.audioKey) {
      throw new Error('SecStream not initialized or track missing audioKey');
    }

    try {
      // Destroy old player if it exists to prevent multiple audio streams
      if (this.player) {
        console.log('🧹 Stopping and destroying previous player');
        this.player.stop();
        this.player = null;
      }

      console.log(`🔐 Creating secure session for track: ${track.title}`);

      // Step 1: Create session on server (gets sessionId)
      this.currentSessionId = await this.transport.createSessionFromTrack(track.audioKey);
      console.log(`✅ Session created: ${this.currentSessionId}`);

      // Step 2: Perform key exchange and initialize session (CRITICAL STEP!)
      console.log('🔑 Performing key exchange and session initialization...');
      const sessionData = await this.client.initializeSession(this.currentSessionId);
      console.log('✅ Session initialized and key exchange completed:', sessionData);

      // Step 3: Create player with the client (session is already initialized)
      this.player = new SecureAudioPlayer(this.client);
      console.log('🎵 SecureAudioPlayer created and ready for playback');

      // Step 4: Connect analyzer to the audio graph for real-time analysis
      this.connectAnalyzer();

      const secureUrl = this.createSecureAudioProxy();

      return secureUrl;
    } catch (error) {
      console.error('❌ Failed to create secure audio URL:', error);
      throw error;
    }
  }

  private createSecureAudioProxy(): string {
    if (!this.player) {
      throw new Error('No SecStream player available');
    }

    return `secstream://session/${this.currentSessionId}`;
  }

  /**
   * Connect an analyzer node to the audio graph for real-time analysis
   * This inserts the analyzer between the player's gain node and the audio destination
   */
  private connectAnalyzer(): void {
    if (!this.player || !this.client) {
      console.warn('Cannot connect analyzer: player or client not initialized');
      return;
    }

    try {
      const audioContext = this.client.getAudioContext();

      // Access the player's private gainNode (TypeScript private is compile-time only)
      const playerGainNode = (this.player as any).gainNode as GainNode;

      if (!playerGainNode) {
        console.error('Could not access player gain node');
        return;
      }

      // Create analyzer node
      this.analyzerNode = audioContext.createAnalyser();
      this.analyzerNode.fftSize = 2048;
      this.analyzerNode.smoothingTimeConstant = 0.8;
      this.analyzerNode.minDecibels = -90;
      this.analyzerNode.maxDecibels = -10;

      // Reconnect audio graph: gainNode -> analyzer -> destination
      playerGainNode.disconnect();
      playerGainNode.connect(this.analyzerNode);
      this.analyzerNode.connect(audioContext.destination);

      console.log('✅ Audio analyzer connected to SecStream audio graph');
    } catch (error) {
      console.error('❌ Failed to connect analyzer:', error);
    }
  }

  /**
   * Get the analyzer node for real-time audio analysis
   */
  getAnalyzerNode(): AnalyserNode | null {
    return this.analyzerNode;
  }

  getPlayer(): SecureAudioPlayer | null {
    return this.player;
  }

  getAudioContext(): AudioContext | null {
    return this.client ? this.client.getAudioContext() : null;
  }

  static isSecStreamUrl(url: string): boolean {
    return url.startsWith('secstream://');
  }

  static extractSessionId(url: string): string | null {
    const match = url.match(/secstream:\/\/session\/(.+)/);
    return match ? match[1] : null;
  }

  async play(): Promise<void> {
    if (!this.player) {
      throw new Error('No SecStream player available');
    }

    // Check AudioContext state BEFORE calling play
    const audioContextBefore = this.client?.getAudioContext();
    console.log('🔍 AudioContext state BEFORE play():', audioContextBefore?.state);
    console.log('🔍 AudioContext:', audioContextBefore);

    try {
      console.log('🎵 SecStreamService.play() - calling player.play()');
      await this.player.play();
      console.log('✅ SecStreamService.play() - player.play() completed');

      // Check if AudioContext is suspended after play attempt
      const audioContext = this.client?.getAudioContext();
      console.log('🔍 AudioContext state AFTER play():', audioContext?.state);
      if (audioContext && audioContext.state === 'suspended') {
        console.warn('⚠️ AudioContext is suspended after play attempt in SecStreamService');
        // Dispatch suspended event manually if player didn't do it
        if (this.player) {
          console.log('📤 Manually dispatching suspended event');
          this.player.dispatchEvent(new CustomEvent('suspended', {
            detail: {
              message: 'AudioContext blocked by browser autoplay policy',
              state: audioContext.state,
            },
          }));
        }
      }
    } catch (error) {
      console.error('❌ SecStream play failed (CAUGHT):', error);
      console.error('❌ Error type:', typeof error);
      console.error('❌ Error instanceof Error:', error instanceof Error);

      // Check if it's an autoplay policy error
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error message:', errorMessage);

      if (errorMessage.includes('AudioContext') || errorMessage.includes('not allowed')) {
        console.warn('⚠️ Autoplay policy error detected in SecStreamService');
        // Dispatch suspended event
        if (this.player) {
          console.log('📤 Dispatching suspended event from catch block');
          this.player.dispatchEvent(new CustomEvent('suspended', {
            detail: {
              message: errorMessage,
              state: this.client?.getAudioContext()?.state,
              error,
            },
          }));
        }
      }

      throw error;
    }
  }

  pause(): void {
    if (this.player) {
      this.player.pause();
    }
  }

  stop(): void {
    if (this.player) {
      this.player.stop();
    }
  }

  setVolume(volume: number): void {
    if (this.player) {
      this.player.setVolume(Math.max(0, Math.min(1, volume)));
    }
  }

  async seek(time: number): Promise<void> {
    if (!this.player) {
      throw new Error('No SecStream player available');
    }

    try {
      await this.player.seekToTime(time);
    } catch (error) {
      console.error('❌ SecStream seek failed:', error);
      throw error;
    }
  }

  getCurrentTime(): number {
    return this.player ? this.player.currentTime : 0;
  }

  getDuration(): number {
    return this.player ? this.player.duration : 0;
  }

  isPlaying(): boolean {
    return this.player ? this.player.isPlaying : false;
  }

  isPaused(): boolean {
    return this.player ? this.player.isPaused : false;
  }

  addEventListener(event: string, listener: EventListener): void {
    if (this.player) {
      this.player.addEventListener(event, listener);
    }
  }

  removeEventListener(event: string, listener: EventListener): void {
    if (this.player) {
      this.player.removeEventListener(event, listener);
    }
  }

  destroy(): void {
    if (this.player) {
      this.player.stop();
      this.player = null;
    }
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.transport = null;
    this.currentSessionId = null;
    console.log('🧹 SecStream service destroyed');
  }
}