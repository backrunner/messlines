import type { APIRoute } from 'astro';
import { sessionManager } from '../sessions.js';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const sessionId = params.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const keyExchangeRequest = await request.json();

    console.log(`🔑 Key exchange for session: ${sessionId}`);
    const response = await sessionManager.handleKeyExchange(sessionId, keyExchangeRequest);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('❌ Key exchange error:', error);
    return new Response(JSON.stringify({ error: 'Key exchange failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};