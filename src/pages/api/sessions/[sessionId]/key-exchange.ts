import type { APIRoute } from 'astro';
import type { ProcessorKeyExchangeRequest } from 'secstream/server';
import { sessionManager } from '../../sessions';

export const POST: APIRoute = async ({ params, request, url }) => {
  try {
    const sessionId = params.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract trackId from query parameters for multi-track sessions
    const trackId = url.searchParams.get('trackId') || undefined;

    const keyExchangeRequest = await request.json() as ProcessorKeyExchangeRequest<unknown>;

    console.log(`🔑 Key exchange for session: ${sessionId}${trackId ? ` (track: ${trackId})` : ''}`);
    const response = await sessionManager.handleKeyExchange(sessionId, keyExchangeRequest, trackId);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: unknown) {
    console.error('❌ Key exchange error:', error);
    return new Response(JSON.stringify({ error: 'Key exchange failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};