import type { APIRoute } from 'astro';
import { sessionManager } from '../../../sessions';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const sessionId = params.sessionId;
    const sliceId = params.sliceId;
    const trackId = url.searchParams.get('trackId') || undefined;

    if (!sessionId || !sliceId) {
      return new Response(JSON.stringify({ error: 'Session ID and Slice ID are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const slice = await sessionManager.getSlice(sessionId, sliceId, trackId);

    if (!slice) {
      return new Response(JSON.stringify({ error: 'Slice not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Combine encrypted data and IV into single binary payload
    const combinedData = new Uint8Array(slice.encryptedData.byteLength + slice.iv.byteLength);
    combinedData.set(new Uint8Array(slice.encryptedData), 0);
    combinedData.set(new Uint8Array(slice.iv), slice.encryptedData.byteLength);

    // Create response with metadata in headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Slice-ID': slice.id,
      'X-Slice-Sequence': slice.sequence.toString(),
      'X-Session-ID': slice.sessionId,
      'X-Encrypted-Data-Length': slice.encryptedData.byteLength.toString(),
      'X-IV-Length': slice.iv.byteLength.toString(),
    };

    // Include track ID in headers if present
    if (slice.trackId) {
      headers['X-Track-ID'] = slice.trackId;
    }

    const response = new Response(combinedData.buffer, {
      status: 200,
      headers,
    });

    console.log(`🔐 Serving binary slice: ${sliceId}, size: ${combinedData.byteLength} bytes`);
    return response;
  } catch (error) {
    console.error('❌ Get slice error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get slice' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};