import type { Transport } from 'secstream/client';
import type { EncryptedSlice, SessionInfo } from 'secstream';
import type {
  ProcessorKeyExchangeRequest as KeyExchangeRequest,
  ProcessorKeyExchangeResponse as KeyExchangeResponse
} from 'secstream';

/**
 * Transport implementation for the artist page application
 * Handles communication with the Astro/Cloudflare backend using preset audio files
 */
export class ArtistPageTransport implements Transport {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async createSession(audioData: File | ArrayBuffer): Promise<string> {
    throw new Error('File upload not supported. Use createSessionFromTrack instead.');
  }

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

  async performKeyExchange<TRequestData = unknown, TResponseData = unknown, TSessionInfo = SessionInfo>(
    sessionId: string,
    request: KeyExchangeRequest<TRequestData>
  ): Promise<KeyExchangeResponse<TResponseData, TSessionInfo>> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/key-exchange`, {
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

  async fetchSlice(sessionId: string, sliceId: string): Promise<EncryptedSlice> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/slices/${sliceId}`);

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

    console.log(`✅ Artist page transport: Fetched slice ${sliceId} (${binaryData.byteLength} bytes)`);

    return {
      id: sliceIdHeader,
      encryptedData,
      iv,
      sequence,
      sessionId: sessionIdHeader,
    };
  }
}