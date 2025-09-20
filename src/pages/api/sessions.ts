import type { APIRoute } from 'astro';
import { parseAudioMetadata } from 'secstream/server';
import { createSessionManager, AudioFileHandler } from '../../utils/secstream.js';

// Initialize session manager with configuration
const sessionManager = createSessionManager();
const audioHandler = new AudioFileHandler();

export const POST: APIRoute = async ({ request }) => {
  try {
    console.log('📥 Received session creation request');

    const { audioKey } = await request.json() as { audioKey: string };

    if (!audioKey) {
      console.error('❌ No audio key provided in request');
      return new Response(JSON.stringify({ error: 'Audio key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get R2 bucket from Cloudflare environment
    const bucket = AUDIO_BUCKET;
    if (!bucket) {
      console.error('❌ R2 bucket not available');
      return new Response(JSON.stringify({ error: 'Audio storage not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get audio file from R2 bucket
    console.log(`📦 Retrieving audio file: ${audioKey}`);
    const audioBuffer = await audioHandler.getAudioFromBucket(audioKey, bucket);

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