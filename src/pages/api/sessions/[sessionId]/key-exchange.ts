import type { APIRoute } from 'astro';
import type { ProcessorKeyExchangeRequest } from 'secstream/server';
import { getSessionMetadata } from '../../../../utils/storage/session-storage-adapter.js';
import { sessionCache } from '../../../../utils/session/session-cache.js';
import { globalWorkerSessionManager } from '../../../../utils/session/global-session-manager.js';

export const POST: APIRoute = async ({ params, request, url, locals }) => {
  const startTime = Date.now();
  try {
    const sessionId = params.sessionId;  // This is actually the DO ID
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    console.log(`🔑 keyExchange API START: session ${sessionId}`);

    // Check worker memory cache for session metadata
    let cachedSession = sessionCache.get(sessionId);

    // Get R2 bucket (optional in dev mode)
    const bucket = locals.runtime?.env?.AUDIO_BUCKET;

    // If not in cache, fetch from storage (DO in prod, memory in dev)
    if (!cachedSession) {
      console.log(`⚠️ Cache MISS for session ${sessionId}, fetching from storage...`);

      try {
        const metadata = await getSessionMetadata(sessionId, locals);
        console.log(`⏱️ [${Date.now() - startTime}ms] Fetched metadata from storage`);

        // Cache for future requests
        cachedSession = {
          doId: sessionId,
          sessionId: metadata.sessionId,
          audioKeys: metadata.audioKeys,
          createdAt: metadata.createdAt,
          cachedAt: Date.now(),
        };
        sessionCache.set(sessionId, cachedSession);
      } catch (doError: unknown) {
        const errorMessage = doError instanceof Error ? doError.message : String(doError);

        if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
          sessionCache.markDeleted(sessionId);
          console.warn(`⚠️ Session ${sessionId} not found or expired in DO`);

          return new Response(JSON.stringify({
            error: 'Session not found or expired',
            details: errorMessage
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
          });
        }

        throw doError;
      }
    } else {
      console.log(`✅ Cache HIT for session ${sessionId}`);
    }

    // Extract trackId from query parameters
    const trackId = url.searchParams.get('trackId') || undefined;

    const keyExchangeRequest = await request.json() as ProcessorKeyExchangeRequest<unknown>;

    console.log(`⏱️ [${Date.now() - startTime}ms] Starting key exchange in worker...`);

    // Perform key exchange in WORKER (not DO!)
    const response = await globalWorkerSessionManager.handleKeyExchange(
      cachedSession.sessionId,  // Use internal sessionId
      cachedSession.audioKeys,
      keyExchangeRequest,
      bucket,
      trackId
    );

    console.log(`⏱️ [${Date.now() - startTime}ms] Key exchange completed`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: unknown) {
    console.error(`❌ Key exchange error (after ${Date.now() - startTime}ms):`, error);
    return new Response(JSON.stringify({
      error: 'Key exchange failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
    });
  }
};