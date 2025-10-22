import type { Transport } from 'secstream/client';
import type { EncryptedSlice, SessionInfo, TrackInfo } from 'secstream';
import type {
  ProcessorKeyExchangeRequest as KeyExchangeRequest,
  ProcessorKeyExchangeResponse as KeyExchangeResponse
} from 'secstream';

/**
 * Transport implementation for the artist page application
 * Handles communication with the Astro/Cloudflare backend using preset audio files
 * Supports multi-track sessions
 */
export class ArtistPageTransport implements Transport {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async createSession(audioData: File | ArrayBuffer): Promise<string> {
    throw new Error('File upload not supported. Use createSessionFromTrack or createSessionFromTracks instead.');
  }

  /**
   * Create a session with a single track (legacy method)
   */
  async createSessionFromTrack(audioKey: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioKey }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json() as { sessionId: string };
    return result.sessionId;
  }

  /**
   * Create a session with multiple tracks
   */
  async createSessionFromTracks(audioKeys: string[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioKeys }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json() as { sessionId: string };
    return result.sessionId;
  }

  async performKeyExchange<TRequestData = unknown, TResponseData = unknown, TSessionInfo = SessionInfo>(
    sessionId: string,
    request: KeyExchangeRequest<TRequestData>,
    trackId?: string
  ): Promise<KeyExchangeResponse<TResponseData, TSessionInfo>> {
    // Build URL with optional trackId query parameter
    const url = trackId
      ? `${this.baseUrl}/api/sessions/${sessionId}/key-exchange?trackId=${encodeURIComponent(trackId)}`
      : `${this.baseUrl}/api/sessions/${sessionId}/key-exchange`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  async getSessionInfo(sessionId: string): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/info`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  async fetchSlice(sessionId: string, sliceId: string, trackId?: string): Promise<EncryptedSlice> {
    // Build URL with optional trackId query parameter
    const url = trackId
      ? `${this.baseUrl}/api/sessions/${sessionId}/slices/${sliceId}?trackId=${encodeURIComponent(trackId)}`
      : `${this.baseUrl}/api/sessions/${sessionId}/slices/${sliceId}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    // Get binary data
    const binaryData = await response.arrayBuffer();

    // Parse metadata from HTTP headers
    const sliceIdHeader = response.headers.get('X-Slice-ID');
    const sequenceHeader = response.headers.get('X-Slice-Sequence');
    const sessionIdHeader = response.headers.get('X-Session-ID');
    const trackIdHeader = response.headers.get('X-Track-ID');
    const encryptedDataLengthHeader = response.headers.get('X-Encrypted-Data-Length');
    const ivLengthHeader = response.headers.get('X-IV-Length');

    if (!sliceIdHeader || !sequenceHeader || !sessionIdHeader ||
      !encryptedDataLengthHeader || !ivLengthHeader) {
      throw new Error('Missing required headers in slice response');
    }

    const encryptedDataLength = parseInt(encryptedDataLengthHeader, 10);
    const ivLength = parseInt(ivLengthHeader, 10);
    const sequence = parseInt(sequenceHeader, 10);

    // Split binary payload
    const encryptedData = binaryData.slice(0, encryptedDataLength);
    const iv = binaryData.slice(encryptedDataLength, encryptedDataLength + ivLength);

    console.log(`✅ Artist page transport: Fetched slice ${sliceId} (${binaryData.byteLength} bytes)${trackId ? ` for track ${trackId}` : ''}`);

    return {
      id: sliceIdHeader,
      trackId: trackIdHeader || undefined,
      encryptedData,
      iv,
      sequence,
      sessionId: sessionIdHeader,
    };
  }

  async addTrack(
    sessionId: string,
    audioData: File | ArrayBuffer,
    metadata?: { title?: string; artist?: string; album?: string }
  ): Promise<TrackInfo> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioData, metadata }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  async removeTrack(sessionId: string, trackIdOrIndex: string | number): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/tracks/${trackIdOrIndex}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }
}