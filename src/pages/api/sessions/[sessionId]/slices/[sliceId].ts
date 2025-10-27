import type { APIRoute } from 'astro';
import { getSessionMetadata } from '../../../../../utils/storage/session-storage-adapter.js';
import { sessionCache } from '../../../../../utils/session/session-cache.js';
import { globalWorkerSessionManager } from '../../../../../utils/session/global-session-manager.js';

export const GET: APIRoute = async ({ params, url, locals }) => {
  const startTime = Date.now();
  try {
    const sessionId = params.sessionId;  // This is actually the DO ID
    const sliceId = params.sliceId;
    const trackId = url.searchParams.get('trackId') || undefined;

    if (!sessionId || !sliceId) {
      return new Response(JSON.stringify({ error: 'Session ID and Slice ID are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    console.log(`🔐 getSlice API START: session ${sessionId}, slice ${sliceId}`);

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

    console.log(`⏱️ [${Date.now() - startTime}ms] Starting slice generation in worker...`);

    // Generate slice in WORKER (not DO!) - This is the key performance improvement
    const slice = await globalWorkerSessionManager.getSlice(
      cachedSession.sessionId,  // Use internal sessionId
      cachedSession.audioKeys,
      sliceId,
      bucket,
      trackId
    );

    console.log(`⏱️ [${Date.now() - startTime}ms] Slice generation completed`);

    if (!slice) {
      return new Response(JSON.stringify({ error: 'Slice not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
      });
    }

    // Combine encrypted data and IV into single binary payload
    const combinedData = new Uint8Array(slice.encryptedData.byteLength + slice.iv.byteLength);
    combinedData.set(new Uint8Array(slice.encryptedData), 0);
    combinedData.set(new Uint8Array(slice.iv), slice.encryptedData.byteLength);

    // Create response with metadata in headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=300',
      'Connection': 'keep-alive',
      'X-Slice-ID': slice.id,
      'X-Slice-Sequence': slice.sequence.toString(),
      'X-Session-ID': sessionId,  // Return DO ID to client
      'X-Encrypted-Data-Length': slice.encryptedData.byteLength.toString(),
      'X-IV-Length': slice.iv.byteLength.toString(),
    };

    if (slice.trackId) {
      headers['X-Track-ID'] = slice.trackId;
    }

    const response = new Response(combinedData.buffer, {
      status: 200,
      headers,
    });

    console.log(`🔐 Served slice ${sliceId}, size: ${combinedData.byteLength} bytes, TOTAL TIME: ${Date.now() - startTime}ms`);
    return response;
  } catch (error) {
    console.error(`❌ Get slice error (after ${Date.now() - startTime}ms):`, error);
    return new Response(JSON.stringify({
      error: 'Failed to get slice',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' }
    });
  }
};