import type { APIRoute } from 'astro';
import { getSessionDO } from '../../../../utils/durable-objects.js';
import { sessionCache } from '../../../../utils/session-cache.js';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const sessionId = params.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID is required' }), {
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

    // Try to get session info, handle errors with cache invalidation
    let info;
    try {
      info = await sessionDO.getSessionInfo(sessionId);
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

    if (!info) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Update cache TTL after successful info fetch (session is still active)
    if (cachedSession) {
      sessionCache.set(sessionId, cachedSession);
      console.log(`🔄 Refreshed cache TTL for session ${sessionId}`);
    }

    return new Response(JSON.stringify(info), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('❌ Get session info error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get session info',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
    });
  }
};