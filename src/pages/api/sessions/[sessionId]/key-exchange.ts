import type { APIRoute } from 'astro';
import type { ProcessorKeyExchangeRequest } from 'secstream/server';
import { getSessionDO } from '../../../../utils/durable-objects.js';

export const POST: APIRoute = async ({ params, request, url, locals }) => {
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

    // Extract trackId from query parameters for multi-track sessions
    const trackId = url.searchParams.get('trackId') || undefined;

    const keyExchangeRequest = await request.json() as ProcessorKeyExchangeRequest<unknown>;

    // Get the Durable Object for this session
    // sessionId is actually the DO ID (used for routing)
    const sessionDO = getSessionDO(sessionsDO, sessionId);

    console.log(`🔑 Key exchange for DO: ${sessionId}${trackId ? ` (track: ${trackId})` : ''}`);
    const response = await sessionDO.handleKeyExchange(sessionId, keyExchangeRequest, trackId);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      }
    });
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