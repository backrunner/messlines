import type { APIRoute } from 'astro';
import { AUDIO_PLAYLIST } from '../../constants/playlist.js';

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Get R2 bucket from Cloudflare environment
    const bucket = locals.runtime.env.AUDIO_BUCKET;

    if (!bucket) {
      console.error('❌ R2 bucket not available');
      return new Response(JSON.stringify({
        error: 'Audio storage not available',
        tracks: AUDIO_PLAYLIST // Return all tracks as fallback (all use SecStream)
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify that audio files exist in bucket
    const availableTracks = [];

    for (const track of AUDIO_PLAYLIST) {
      try {
        const object = await bucket.head(track.audioKey);
        if (object) {
          availableTracks.push({
            ...track,
            size: object.size,
            lastModified: object.uploaded
          });
        }
      } catch (error) {
        console.warn(`⚠️ Audio file not found: ${track.audioKey}`);
      }
    }

    console.log(`📦 Found ${availableTracks.length} available audio tracks`);

    return new Response(JSON.stringify({
      tracks: availableTracks,
      count: availableTracks.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('❌ Failed to list audio tracks:', error);
    return new Response(JSON.stringify({
      error: 'Failed to list audio tracks',
      tracks: AUDIO_PLAYLIST // Return all tracks as fallback (all use SecStream)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};