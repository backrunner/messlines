import type { APIRoute } from 'astro';
import { parseAudioMetadata } from 'secstream/server';
import { createSessionManager, AudioFileHandler } from '../../utils/secstream.js';

// Initialize session manager with configuration
const sessionManager = createSessionManager();
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
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get R2 bucket from Cloudflare environment
    const bucket = locals.runtime.env.AUDIO_BUCKET;
    if (!bucket) {
      console.error('❌ R2 bucket not available');
      return new Response(JSON.stringify({ error: 'Audio storage not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get cache and context for caching
    const cache = locals.runtime.caches.default;
    const ctx = locals.runtime.ctx;

    // Handle multi-track session creation
    if (audioKeys && audioKeys.length > 0) {
      console.log(`📦 Creating multi-track session with ${audioKeys.length} tracks`);

      // Load all audio files and prepare track objects
      const tracks = [];
      for (let i = 0; i < audioKeys.length; i++) {
        const key = audioKeys[i];
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

        tracks.push({
          audioData: buffer,
          metadata: {
            title: `Track ${i + 1}`, // You can extract from audioKey if needed
          }
        });
      }

      // Create multi-track session
      console.log('🏗️ Creating multi-track session with SessionManager...');
      const sessionId = await sessionManager.createMultiTrackSession(tracks);
      console.log('✅ Multi-track session created successfully:', sessionId);

      const response = {
        sessionId,
        audioKeys,
        trackCount: audioKeys.length,
        message: 'Multi-track session created successfully',
      };

      console.log('📤 Sending successful response:', response);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle single track session creation (legacy)
    console.log(`📦 Retrieving audio file: ${audioKey}`);

    // Try to get from cache first
    const cacheKey = new Request(`${locals.runtime.env.WORKER_URL || 'https://cache.local'}/audio-cache/${audioKey}`) as unknown as Request;
    let cachedBuffer = await cache.match(cacheKey as any);

    let audioBuffer: ArrayBuffer;
    if (cachedBuffer) {
      console.log(`✅ Cache hit for audio: ${audioKey}`);
      audioBuffer = await cachedBuffer.arrayBuffer();
    } else {
      console.log(`❌ Cache miss for audio: ${audioKey}, fetching from R2...`);
      audioBuffer = await audioHandler.getAudioFromBucket(audioKey!, bucket);

      // Cache the audio file asynchronously
      if (ctx && ctx.waitUntil) {
        const responseToCache = new Response(audioBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
          }
        });
        ctx.waitUntil(cache.put(cacheKey as any, responseToCache as any));
        console.log(`💾 Caching audio: ${audioKey}`);
      }
    }

    console.log('📊 Audio buffer size:', audioBuffer.byteLength);

    // Detect audio format
    console.log('🔍 Detecting audio format...');
    const metadata = parseAudioMetadata(audioBuffer);
    console.log(`📄 Detected format: ${metadata.format}, Sample rate: ${metadata.sampleRate}Hz, Channels: ${metadata.channels}`);

    // Create session
    console.log('🏗️ Creating session with SessionManager...');
    const sessionId = await sessionManager.createSession(audioBuffer);
    console.log('✅ Session created successfully:', sessionId);

    const response = {
      sessionId,
      audioKey,
      metadata: {
        format: metadata.format,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        duration: metadata.duration,
      },
      message: 'Session created successfully',
    };

    console.log('📤 Sending successful response:', response);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
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
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Export session manager for use in other endpoints
export { sessionManager };