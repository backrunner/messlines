import type { APIRoute } from 'astro';
import { createSessionDO } from '../../utils/storage/durable-objects.js';
import { validateAudioKeys } from '../../utils/validation/playlist-validator.js';
import { sessionCache } from '../../utils/session/session-cache.js';
import { nanoid } from 'nanoid';
import { isDevMode, createSession as createSessionStorage } from '../../utils/storage/session-storage-adapter.js';

// Rate limiting configuration
const MAX_SESSIONS_PER_WINDOW = 10;
const SESSION_CREATION_WINDOW_MS = 60 * 1000;

/**
 * Check session creation rate limit using Cloudflare KV
 * Uses sliding window algorithm with KV for distributed rate limiting
 */
async function checkSessionCreationRateLimit(kv: KVNamespace): Promise<boolean> {
  const now = Date.now();
  const key = 'session_creation_rate_limit';

  // Get existing timestamps from KV
  const stored = await kv.get(key, 'json') as number[] | null;
  const timestamps = stored || [];

  // Remove old timestamps outside the window
  const windowStart = now - SESSION_CREATION_WINDOW_MS;
  const validTimestamps = timestamps.filter(ts => ts > windowStart);

  // Check if limit exceeded
  if (validTimestamps.length >= MAX_SESSIONS_PER_WINDOW) {
    console.warn(`⚠️ Session creation rate limit exceeded`);
    return false;
  }

  // Add current timestamp
  validTimestamps.push(now);

  // Store back to KV with TTL
  await kv.put(key, JSON.stringify(validTimestamps), {
    expirationTtl: Math.ceil(SESSION_CREATION_WINDOW_MS / 1000)
  });

  return true;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    console.log('📥 Received session creation request');

    // Get KV namespace for rate limiting
    const rateLimitKV = locals.runtime.env.RATE_LIMIT_KV;
    if (!rateLimitKV) {
      console.error('❌ Rate limit KV not available');
      // Continue without rate limiting if KV is not available
    } else {
      // Check rate limit for session creation using KV
      const allowed = await checkSessionCreationRateLimit(rateLimitKV);
      if (!allowed) {
        console.error('❌ Session creation rate limit exceeded');
        return new Response(JSON.stringify({
          error: 'Too many requests',
          message: 'Please try again later.'
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
        });
      }
    }

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

    // Prepare audio keys array for validation
    const keysToLoad = audioKeys && audioKeys.length > 0 ? audioKeys : [audioKey!];

    // SECURITY: Validate that all requested audio keys are in the allowed AUDIO_PLAYLIST
    const validation = validateAudioKeys(keysToLoad);
    if (!validation.valid) {
      console.error(`❌ Unauthorized audio keys requested: ${validation.invalidKeys.join(', ')}`);
      return new Response(JSON.stringify({
        error: 'Audio file not found',
        message: 'One or more requested audio files are not available'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    console.log(`✅ Validated audio keys: ${keysToLoad.join(', ')}`);

    // Generate session ID for secstream (internal use)
    const sessionId = nanoid();

    // Create session (uses Durable Objects in prod, in-memory in dev)
    // Returns the DO ID (or session ID in dev mode) for client routing
    console.log(`🏗️ Creating session with internal ID: ${sessionId}`);
    const doId = await createSessionStorage(sessionId, keysToLoad, locals);

    console.log(`✅ Session created successfully. Internal ID: ${sessionId}, DO ID: ${doId}`);

    // Cache session metadata in worker memory to reduce future DO requests
    // Use doId as key since that's what client uses for routing
    sessionCache.set(doId, {
      doId,
      sessionId,
      audioKeys: keysToLoad,
      createdAt: Date.now(),
      cachedAt: Date.now(),
    });
    console.log(`💾 Cached session metadata for ${doId} in worker memory`);

    const response = {
      sessionId: doId,  // Return doId to client for routing
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