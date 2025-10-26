import type { APIRoute } from 'astro';
import type { ProcessorKeyExchangeRequest } from 'secstream/server';
import { getSessionDO } from '../../../../utils/durable-objects.js';
import { sessionCache } from '../../../../utils/session-cache.js';

export const POST: APIRoute = async ({ params, request, url, locals }) => {
  try {
    const sessionId = params.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Check worker memory cache first to avoid DO request
    const cachedSession = sessionCache.get(sessionId);
    if (!cachedSession) {
      console.log(`⚠️ Worker cache MISS for session ${sessionId}, will access DO`);
    } else {
      console.log(`✅ Worker cache HIT for session ${sessionId}, verified session exists`);
      // Session exists in cache, we can proceed with confidence
      // We still need to access DO for actual key exchange (crypto operations)
      // but this reduces unnecessary DO lookups for invalid sessions
    }

    // Get Durable Objects namespace
    const sessionsDO = locals.runtime.env.SECSTREAM_SESSIONS;
    if (!sessionsDO) {
      return new Response(JSON.stringify({ error: 'Session storage not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Extract trackId from query parameters for multi-track sessions
    const trackId = url.searchParams.get('trackId') || undefined;

    const keyExchangeRequest = await request.json() as ProcessorKeyExchangeRequest<unknown>;

    // Get the Durable Object for this session
    // sessionId is actually the DO ID (used for routing)
    const sessionDO = getSessionDO(sessionsDO, sessionId);

    console.log(`🔑 Key exchange for DO: ${sessionId}${trackId ? ` (track: ${trackId})` : ''}`);

    // Try to perform key exchange
    try {
      const response = await sessionDO.handleKeyExchange(sessionId, keyExchangeRequest, trackId);

      // Update cache after successful key exchange (session is still active)
      if (cachedSession) {
        sessionCache.set(sessionId, cachedSession);
        console.log(`🔄 Refreshed cache TTL for session ${sessionId}`);
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        }
      });
    } catch (doError: unknown) {
      // Check if error indicates session not found or expired
      const errorMessage = doError instanceof Error ? doError.message : String(doError);

      if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
        // Invalidate cache - session was deleted/expired in DO
        sessionCache.markDeleted(sessionId);
        console.warn(`⚠️ Session ${sessionId} not found in DO, invalidated cache`);

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
  } catch (error: unknown) {
    console.error('❌ Key exchange error:', error);
    return new Response(JSON.stringify({
      error: 'Key exchange failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
    });
  }
};