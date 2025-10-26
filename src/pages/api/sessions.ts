import type { APIRoute } from 'astro';
import { AudioFileHandler } from '../../utils/secstream.js';
import { createSessionDO } from '../../utils/durable-objects.js';

const audioHandler = new AudioFileHandler();

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    console.log('📥 Received session creation request');

    const body = await request.json() as { audioKey?: string; audioKeys?: string[] };
    const { audioKey, audioKeys } = body;

    // Support both single track (audioKey) and multi-track (audioKeys) sessions
    if (!audioKey && (!audioKeys || audioKeys.length === 0)) {
      console.error('❌ No audio key provided in request');
      return new Response(JSON.stringify({ error: 'Audio key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Get R2 bucket and Durable Objects namespace from Cloudflare environment
    const bucket = locals.runtime.env.AUDIO_BUCKET;
    const sessionsDO = locals.runtime.env.SECSTREAM_SESSIONS;

    if (!bucket) {
      console.error('❌ R2 bucket not available');
      return new Response(JSON.stringify({ error: 'Audio storage not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    if (!sessionsDO) {
      console.error('❌ Durable Objects namespace not available');
      return new Response(JSON.stringify({ error: 'Session storage not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Get cache and context for caching
    const cache = locals.runtime.caches.default;
    const ctx = locals.runtime.ctx;

    // Prepare audio keys array
    const keysToLoad = audioKeys && audioKeys.length > 0 ? audioKeys : [audioKey!];

    // Load all audio files
    const audioBuffers: ArrayBuffer[] = [];
    for (const key of keysToLoad) {
      console.log(`📦 Retrieving audio file: ${key}`);

      // Try to get from cache first
      const cacheKey = new Request(`${locals.runtime.env.WORKER_URL || 'https://cache.local'}/audio-cache/${key}`) as unknown as Request;
      let cachedBuffer = await cache.match(cacheKey as any);

      let buffer: ArrayBuffer;
      if (cachedBuffer) {
        console.log(`✅ Cache hit for audio: ${key}`);
        buffer = await cachedBuffer.arrayBuffer();
      } else {
        console.log(`❌ Cache miss for audio: ${key}, fetching from R2...`);
        buffer = await audioHandler.getAudioFromBucket(key, bucket);

        // Cache the audio file asynchronously
        if (ctx && ctx.waitUntil) {
          const responseToCache = new Response(buffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Cache-Control': 'public, max-age=31536000, immutable',
            }
          });
          ctx.waitUntil(cache.put(cacheKey as any, responseToCache as any));
          console.log(`💾 Caching audio: ${key}`);
        }
      }

      audioBuffers.push(buffer);
    }

    // Create a new Durable Object for this session
    const { stub: sessionDO, sessionId: doId } = createSessionDO(sessionsDO);

    // Create session in the Durable Object
    // Pass the DO ID so it can be used for routing and returned to the client
    console.log(`🏗️ Creating session in Durable Object: ${doId}`);
    const sessionId = await sessionDO.createSession(doId, keysToLoad, audioBuffers);

    console.log(`✅ Session created successfully. Client session ID: ${sessionId}`);

    const response = {
      sessionId,
      audioKeys: keysToLoad,
      trackCount: keysToLoad.length,
      message: 'Session created successfully',
    };

    console.log('📤 Sending successful response:', response);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: unknown) {
    console.error('❌ Session creation error:', error);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'Unknown stack',
      name: error instanceof Error ? error.name : 'Unknown error'
    });

    const errorResponse = {
      error: 'Failed to create session',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
    console.error('📤 Sending error response:', errorResponse);
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      }
    });
  }
};