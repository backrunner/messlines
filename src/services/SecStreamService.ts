import {
  SecureAudioClient,
  SecureAudioPlayer,
  AggressiveBufferStrategy,
  LinearPrefetchStrategy,
  type TrackInfo
} from 'secstream/client';
import { ArtistPageTransport } from '../transport/ArtistPageTransport';
import { SECSTREAM_CONFIG, AUDIO_PLAYLIST } from '../constants/playlist';
import type { AudioTrack } from '../constants/playlist';

interface SuspendedEventDetail {
  message: string;
  state?: AudioContextState;
  error?: unknown;
}

// Internal interface to access SecureAudioPlayer's private gainNode
// This is necessary for connecting the analyzer to the audio graph
interface SecureAudioPlayerInternal {
  gainNode: GainNode;
}

export class SecStreamService {
  private client: SecureAudioClient | null = null;
  private player: SecureAudioPlayer | null = null;
  private transport: ArtistPageTransport | null = null;
  private currentSessionId: string | null = null;
  private analyzerNode: AnalyserNode | null = null;
  private isSessionInitialized = false;
  private trackMapping: Map<number, string> = new Map(); // Maps playlist track index to SecStream trackId

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      // Ensure we're in a browser environment
      if (typeof window === 'undefined') {
        throw new Error('SecStreamService can only be initialized in browser environment');
      }

      this.transport = new ArtistPageTransport(window.location.origin);

      // Get worker URL from secstream package
      let workerUrl: string | undefined;
      if (SECSTREAM_CONFIG.workerConfig?.enabled && typeof Worker !== 'undefined') {
        try {
          // Use the worker from secstream package
          workerUrl = new URL('secstream/client/worker', import.meta.url).href;
          console.log('🔧 Worker URL:', workerUrl);
        } catch (error) {
          console.warn('⚠️ Failed to load worker URL:', error);
          // Disable workers if URL loading fails
          SECSTREAM_CONFIG.workerConfig.enabled = false;
        }
      } else if (SECSTREAM_CONFIG.workerConfig?.enabled) {
        console.warn('⚠️ Worker API not available, disabling workers');
        SECSTREAM_CONFIG.workerConfig.enabled = false;
      }

      this.client = new SecureAudioClient(this.transport, {
        workerConfig: SECSTREAM_CONFIG.workerConfig,
        workerUrl: workerUrl,
      });

      console.log('✅ SecStream initialized:', {
        workerEnabled: SECSTREAM_CONFIG.workerConfig?.enabled,
        workerCount: SECSTREAM_CONFIG.workerConfig?.workerCount,
        clientCreated: !!this.client,
        transportCreated: !!this.transport,
      });
    } catch (error: unknown) {
      console.error('❌ Failed to initialize SecStream service:', error);
      // Rethrow to prevent silent failures
      throw error;
    }
  }

  /**
   * Initialize the session with all tracks from the playlist
   * This creates a single session that can handle multiple tracks
   */
  async initializePlaylist(playlist: AudioTrack[] = AUDIO_PLAYLIST): Promise<void> {
    if (!this.client || !this.transport) {
      throw new Error('SecStream not initialized');
    }

    if (this.isSessionInitialized) {
      console.log('📝 Session already initialized, skipping...');
      return;
    }

    try {
      console.log('🔐 Creating multi-track session with', playlist.length, 'tracks');

      // Step 1: Create session with all tracks
      const audioKeys = playlist.map(track => track.audioKey);
      this.currentSessionId = await this.transport.createSessionFromTracks(audioKeys);
      console.log(`✅ Multi-track session created: ${this.currentSessionId}`);

      // Step 2: Perform key exchange and initialize session
      console.log('🔑 Performing key exchange and session initialization...');
      const sessionData = await this.client.initializeSession(this.currentSessionId);
      console.log('✅ Session initialized with', sessionData.tracks?.length || 0, 'tracks');

      // Step 3: Build track mapping (playlist index -> SecStream trackId)
      if (sessionData.tracks) {
        sessionData.tracks.forEach((trackInfo: TrackInfo, index: number) => {
          this.trackMapping.set(index, trackInfo.trackId);
          console.log(`📌 Track ${index} (${playlist[index].title}) mapped to ${trackInfo.trackId}`);
        });
      }

      // Step 4: Create player with the client (session is already initialized)
      this.player = new SecureAudioPlayer(this.client, {
        bufferStrategy: new AggressiveBufferStrategy(),
        prefetchStrategy: new LinearPrefetchStrategy({
          minPrefetchAhead: 3,
        }),
        smartPrefetchNextTrack: true, // Enable smart prefetching of next track
        nextTrackPrefetchThreshold: 10, // Start prefetching 10 seconds before end
      });
      console.log('🎵 SecureAudioPlayer created with multi-track support');

      // Step 5: Connect analyzer to the audio graph for real-time analysis
      this.connectAnalyzer();

      // Step 6: Set up track change listener
      this.setupTrackChangeListener();

      this.isSessionInitialized = true;

      console.log('✅ Multi-track playlist initialized successfully');
    } catch (error: unknown) {
      console.error('❌ Failed to initialize playlist:', error);

      // Check if error indicates session expired
      if (this.isSessionExpiredError(error)) {
        console.warn('⏰ Session expired, will recreate on next operation');
        // Clear session state to force recreation
        this.resetSessionState();
      }

      throw error;
    }
  }

  /**
   * Check if error indicates session expiration
   */
  private isSessionExpiredError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorMessage.includes('expired') ||
           errorMessage.includes('not found') ||
           errorMessage.includes('404');
  }

  /**
   * Reset session state to allow recreation
   */
  private resetSessionState(): void {
    this.currentSessionId = null;
    this.isSessionInitialized = false;
    this.trackMapping.clear();

    // Don't destroy player/client here as they may be reusable
    // Just clear session-specific state

    console.log('🔄 Session state reset, ready for recreation');
  }

  /**
   * Set up event listener for track changes
   */
  private setupTrackChangeListener(): void {
    if (!this.player) return;

    this.player.addEventListener('trackchange', (event) => {
      const customEvent = event as CustomEvent;
      const trackInfo = customEvent.detail?.track as TrackInfo;
      console.log('🎵 Track changed to:', trackInfo?.trackId, trackInfo?.title);
    });
  }

  /**
   * Switch to a specific track by playlist index
   */
  async switchToTrack(trackIndex: number, autoPlay: boolean = false): Promise<void> {
    if (!this.player || !this.client) {
      throw new Error('SecStream not initialized');
    }

    if (!this.isSessionInitialized) {
      await this.initializePlaylist();
    }

    try {
      const trackId = this.trackMapping.get(trackIndex);
      if (!trackId) {
        throw new Error(`Track index ${trackIndex} not found in mapping`);
      }

      console.log(`🔄 Switching to track ${trackIndex} (${trackId})`);
      await this.player.switchTrack(trackId, autoPlay);
      console.log('✅ Track switched successfully');
    } catch (error: unknown) {
      console.error('❌ Failed to switch track:', error);

      // Check if error indicates session expired
      if (this.isSessionExpiredError(error)) {
        console.warn('⏰ Session expired during track switch, reinitializing...');
        this.resetSessionState();

        // Retry once after recreating session
        await this.initializePlaylist();
        const trackId = this.trackMapping.get(trackIndex);
        if (trackId) {
          await this.player!.switchTrack(trackId, autoPlay);
          console.log('✅ Track switched successfully after session recreation');
          return;
        }
      }

      throw error;
    }
  }

  /**
   * Switch to the next track in the playlist
   */
  async nextTrack(autoPlay: boolean = true): Promise<void> {
    if (!this.player) {
      throw new Error('SecStream not initialized');
    }

    if (!this.isSessionInitialized) {
      await this.initializePlaylist();
    }

    try {
      console.log('⏭️ Switching to next track');
      await this.player.nextTrack(autoPlay);
      console.log('✅ Switched to next track');
    } catch (error: unknown) {
      console.error('❌ Failed to switch to next track:', error);

      // Check if error indicates session expired
      if (this.isSessionExpiredError(error)) {
        console.warn('⏰ Session expired during next track, reinitializing...');
        this.resetSessionState();

        // Retry once after recreating session
        await this.initializePlaylist();
        await this.player.nextTrack(autoPlay);
        console.log('✅ Switched to next track after session recreation');
        return;
      }

      throw error;
    }
  }

  /**
   * Switch to the previous track in the playlist
   */
  async previousTrack(autoPlay: boolean = true): Promise<void> {
    if (!this.player) {
      throw new Error('SecStream not initialized');
    }

    if (!this.isSessionInitialized) {
      await this.initializePlaylist();
    }

    try {
      console.log('⏮️ Switching to previous track');
      await this.player.previousTrack(autoPlay);
      console.log('✅ Switched to previous track');
    } catch (error: unknown) {
      console.error('❌ Failed to switch to previous track:', error);

      // Check if error indicates session expired
      if (this.isSessionExpiredError(error)) {
        console.warn('⏰ Session expired during previous track, reinitializing...');
        this.resetSessionState();

        // Retry once after recreating session
        await this.initializePlaylist();
        await this.player.previousTrack(autoPlay);
        console.log('✅ Switched to previous track after session recreation');
        return;
      }

      throw error;
    }
  }

  /**
   * Get current track information
   */
  getCurrentTrackInfo(): TrackInfo | null {
    if (!this.player) return null;
    return this.player.getCurrentTrack();
  }

  /**
   * Get all tracks in the session
   */
  getTracks(): TrackInfo[] {
    if (!this.player) return [];
    return this.player.getTracks();
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use initializePlaylist() and switchToTrack() instead
   */
  async createSecureAudioUrl(track: AudioTrack): Promise<string> {
    if (!this.client || !this.transport || !track.audioKey) {
      throw new Error('SecStream not initialized or track missing audioKey');
    }

    try {
      // Initialize playlist if not already done
      if (!this.isSessionInitialized) {
        await this.initializePlaylist();
      }

      // Find the track index in the playlist
      const trackIndex = AUDIO_PLAYLIST.findIndex(t => t.id === track.id);
      if (trackIndex === -1) {
        throw new Error(`Track ${track.title} not found in playlist`);
      }

      // Switch to the track
      await this.switchToTrack(trackIndex, false);

      const secureUrl = this.createSecureAudioProxy();

      return secureUrl;
    } catch (error: unknown) {
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
      const playerGainNode = (this.player as unknown as SecureAudioPlayerInternal).gainNode;

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
    } catch (error: unknown) {
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
          const detail: SuspendedEventDetail = {
            message: 'AudioContext blocked by browser autoplay policy',
            state: audioContext.state,
          };
          this.player.dispatchEvent(new CustomEvent('suspended', { detail }));
        }
      }
    } catch (error: unknown) {
      console.error('❌ SecStream play failed (CAUGHT):', error);
      console.error('❌ Error type:', typeof error);
      console.error('❌ Error instanceof Error:', error instanceof Error);

      // Check if it's an autoplay policy error
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error message:', errorMessage);

      // Check if error indicates session expired
      if (this.isSessionExpiredError(error)) {
        console.warn('⏰ Session expired during play, reinitializing...');
        this.resetSessionState();

        // Retry once after recreating session
        await this.initializePlaylist();
        await this.player.play();
        console.log('✅ Play succeeded after session recreation');
        return;
      }

      if (errorMessage.includes('AudioContext') || errorMessage.includes('not allowed')) {
        console.warn('⚠️ Autoplay policy error detected in SecStreamService');
        // Dispatch suspended event
        if (this.player) {
          console.log('📤 Dispatching suspended event from catch block');
          const detail: SuspendedEventDetail = {
            message: errorMessage,
            state: this.client?.getAudioContext()?.state,
            error,
          };
          this.player.dispatchEvent(new CustomEvent('suspended', { detail }));
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
    } catch (error: unknown) {
      console.error('❌ SecStream seek failed:', error);

      // Check if error indicates session expired
      if (this.isSessionExpiredError(error)) {
        console.warn('⏰ Session expired during seek, reinitializing...');
        this.resetSessionState();

        // Retry once after recreating session
        await this.initializePlaylist();
        await this.player.seekToTime(time);
        console.log('✅ Seek succeeded after session recreation');
        return;
      }

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