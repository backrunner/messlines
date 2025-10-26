import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    const response = {
      server: 'astro-cloudflare',
      framework: 'secstream',
      sessionStorage: 'durable-objects',
      timestamp: new Date().toISOString(),
      status: 'operational',
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