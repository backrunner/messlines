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
      console.log(`🔐 Creating secure session for track: ${track.title}`);
      this.currentSessionId = await this.transport.createSessionFromTrack(track.audioKey);

      this.player = new SecureAudioPlayer(this.client);

      const secureUrl = this.createSecureAudioProxy();

      console.log(`✅ Secure session created: ${this.currentSessionId}`);
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

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gainNode = audioContext.createGain();

    return `secstream://session/${this.currentSessionId}`;
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

    try {
      await this.player.play();
    } catch (error) {
      console.error('❌ SecStream play failed:', error);
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