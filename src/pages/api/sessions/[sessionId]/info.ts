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
    const info = await sessionDO.getSessionInfo(sessionId);

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