import type { APIRoute } from 'astro';
import { getSessionDO } from '../../../../utils/durable-objects.js';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const sessionId = params.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
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