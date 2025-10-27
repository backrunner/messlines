import type { APIRoute } from 'astro';
import { getSessionDO } from '../../../../../utils/durable-objects.js';
import { sessionCache } from '../../../../../utils/session-cache.js';

export const GET: APIRoute = async ({ params, url, locals }) => {
  try {
    const sessionId = params.sessionId;
    const sliceId = params.sliceId;
    const trackId = url.searchParams.get('trackId') || undefined;

    if (!sessionId || !sliceId) {
      return new Response(JSON.stringify({ error: 'Session ID and Slice ID are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Check worker memory cache first for session validation
    const cachedSession = sessionCache.get(sessionId);
    if (!cachedSession) {
      console.log(`⚠️ Worker cache MISS for session ${sessionId}, will access DO`);
    } else {
      console.log(`✅ Worker cache HIT for session ${sessionId}, verified session exists`);
      // Session exists in cache, we still need to access DO for slice retrieval
      // (slices are encrypted per-session and can't be cached in worker)
    }

    // Get Durable Objects namespace
    const sessionsDO = locals.runtime.env.SECSTREAM_SESSIONS;
    if (!sessionsDO) {
      return new Response(JSON.stringify({ error: 'Session storage not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Get the Durable Object for this session
    const sessionDO = getSessionDO(sessionsDO, sessionId);

    // Try to get slice, handle errors with cache invalidation
    let slice;
    try {
      slice = await sessionDO.getSlice(sessionId, sliceId, trackId);
    } catch (doError: unknown) {
      // Check if error indicates session not found or expired
      const errorMessage = doError instanceof Error ? doError.message : String(doError);

      if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
        // Invalidate cache - session was deleted/expired in DO
        sessionCache.markDeleted(sessionId);
        console.warn(`⚠️ Session ${sessionId} not found or expired in DO, invalidated cache`);

        return new Response(JSON.stringify({
          error: 'Session not found or expired',
          details: errorMessage
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
        });
      }

      // Re-throw other errors
      throw doError;
    }

    if (!slice) {
      // Session exists but slice not found - might be invalid sliceId
      return new Response(JSON.stringify({ error: 'Slice not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Update cache TTL after successful slice fetch (session is still active)
    if (cachedSession) {
      sessionCache.set(sessionId, cachedSession);
      console.log(`🔄 Refreshed cache TTL for session ${sessionId}`);
    }

    // Combine encrypted data and IV into single binary payload
    const combinedData = new Uint8Array(slice.encryptedData.byteLength + slice.iv.byteLength);
    combinedData.set(new Uint8Array(slice.encryptedData), 0);
    combinedData.set(new Uint8Array(slice.iv), slice.encryptedData.byteLength);

    // Create response with metadata in headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=300',
      'Connection': 'keep-alive',
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
    return new Response(JSON.stringify({
      error: 'Failed to get slice',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
    });
  }
};