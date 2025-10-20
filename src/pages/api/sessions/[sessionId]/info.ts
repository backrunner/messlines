import type { APIRoute } from 'astro';
import { sessionManager } from '../../sessions';

export const GET: APIRoute = async ({ params }) => {
  try {
    const sessionId = params.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const info = sessionManager.getSessionInfo(sessionId);

    if (!info) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(info), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('❌ Get session info error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get session info' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};