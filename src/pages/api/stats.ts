import type { APIRoute } from 'astro';
import { sessionManager } from '../sessions';

export const GET: APIRoute = async () => {
  try {
    const stats = sessionManager.getStats();

    const response = {
      server: 'astro-cloudflare',
      framework: 'secstream',
      timestamp: new Date().toISOString(),
      ...stats,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};