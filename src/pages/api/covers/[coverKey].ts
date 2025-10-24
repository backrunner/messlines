import type { APIRoute } from 'astro';
import { AUDIO_PLAYLIST } from '../../../constants/playlist';
import { decode as decodeJpeg } from '@jsquash/jpeg';
import { decode as decodePng } from '@jsquash/png';
import { encode as encodeWebp, decode as decodeWebp } from '@jsquash/webp';
import { encode as encodeAvif } from '@jsquash/avif';

export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    // Extract the filename from URL (e.g., "falling_flowers.png")
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/api/covers/');
    const filename = pathParts[1] || params.coverKey;

    if (!filename) {
      return new Response(JSON.stringify({ error: 'Cover filename is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Look up the full cover key from AUDIO_PLAYLIST
    const track = AUDIO_PLAYLIST.find(t => t.coverKey?.endsWith(filename));
    const coverKey = track?.coverKey;

    if (!coverKey) {
      console.error(`❌ Cover not found in playlist for filename: ${filename}`);
      return new Response(JSON.stringify({ error: 'Cover not found in playlist' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`📷 Looking up cover: ${filename} -> ${coverKey}`);

    // Determine requested format from Accept header
    const acceptHeader = request.headers.get('accept') || '';
    const supportsAvif = acceptHeader.includes('image/avif');
    const supportsWebp = acceptHeader.includes('image/webp');

    // Create format-specific cache key
    let formatSuffix = '';
    if (supportsAvif) {
      formatSuffix = '?format=avif';
    } else if (supportsWebp) {
      formatSuffix = '?format=webp';
    }

    // Create cache key from request URL with format suffix
    const cache = locals.runtime.caches.default;
    const cacheUrl = url.toString().split('?')[0] + formatSuffix;
    const cacheKey = new Request(cacheUrl) as unknown as Request;

    // Check if response is in cache
    const cachedResponse = await cache.match(cacheKey as any);

    if (cachedResponse) {
      console.log(`✅ Cache hit for cover: ${coverKey}${formatSuffix}`);
      return cachedResponse as unknown as Response;
    }

    console.log(`❌ Cache miss for cover: ${coverKey}${formatSuffix}, fetching from R2...`);

    // Get R2 bucket from Cloudflare environment
    const bucket = locals.runtime.env.AUDIO_BUCKET;
    if (!bucket) {
      console.error('❌ R2 bucket not available');
      return new Response(JSON.stringify({ error: 'Cover storage not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`📦 Retrieving cover: ${coverKey}`);
    const object = await bucket.get(coverKey);

    if (!object) {
      return new Response(JSON.stringify({ error: 'Cover not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Determine content type from file extension
    const extension = coverKey.toLowerCase().split('.').pop();
    let contentType = 'image/png';
    if (extension === 'jpg' || extension === 'jpeg') {
      contentType = 'image/jpeg';
    } else if (extension === 'webp') {
      contentType = 'image/webp';
    } else if (extension === 'gif') {
      contentType = 'image/gif';
    }

    let imageBuffer = await object.arrayBuffer();

    // Convert image format if client supports modern formats
    let outputFormat = contentType;
    let needsConversion = false;

    if (supportsAvif && contentType !== 'image/avif') {
      outputFormat = 'image/avif';
      needsConversion = true;
      console.log(`🔄 Converting ${coverKey} to AVIF`);
    } else if (supportsWebp && contentType !== 'image/webp') {
      outputFormat = 'image/webp';
      needsConversion = true;
      console.log(`🔄 Converting ${coverKey} to WebP`);
    }

    // Perform image conversion if needed using @jsquash
    if (needsConversion) {
      try {
        // Decode the original image to ImageData
        let imageData: ImageData;
        if (contentType === 'image/jpeg') {
          imageData = await decodeJpeg(imageBuffer);
        } else if (contentType === 'image/png') {
          imageData = await decodePng(imageBuffer);
        } else if (contentType === 'image/webp') {
          // If source is already WebP and we want AVIF, decode it first
          imageData = await decodeWebp(imageBuffer);
        } else {
          // For unsupported formats, try PNG decoder as fallback
          imageData = await decodePng(imageBuffer);
        }

        // Encode to target format
        if (outputFormat === 'image/avif') {
          const converted = await encodeAvif(imageData);
          imageBuffer = converted instanceof ArrayBuffer ? converted : (converted as any).buffer;
          contentType = 'image/avif';
          console.log(`✅ Converted to AVIF, original size: ${imageBuffer.byteLength} bytes`);
        } else if (outputFormat === 'image/webp') {
          const converted = await encodeWebp(imageData);
          imageBuffer = converted instanceof ArrayBuffer ? converted : (converted as any).buffer;
          contentType = 'image/webp';
          console.log(`✅ Converted to WebP, original size: ${imageBuffer.byteLength} bytes`);
        }
      } catch (conversionError) {
        console.warn(`⚠️ Image conversion failed, serving original format:`, conversionError);
        // Fall back to original format if conversion fails
      }
    }

    console.log(`✅ Serving cover: ${coverKey}, format: ${contentType}, size: ${imageBuffer.byteLength} bytes`);

    // Calculate expiration date (1 year from now)
    const expiresDate = new Date();
    expiresDate.setFullYear(expiresDate.getFullYear() + 1);

    // Create response with aggressive cache headers
    const response = new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, stale-while-revalidate=86400, immutable', // Cache for 1 year, allow stale for 1 day
        'Expires': expiresDate.toUTCString(), // HTTP/1.0 compatibility
        'ETag': object.etag || `"${coverKey}"`,
        'Last-Modified': object.uploaded?.toUTCString() || new Date().toUTCString(),
        'Vary': 'Accept', // Important: Tell caches that response varies by Accept header
      }
    });

    // Store in cache asynchronously (don't block response)
    // Note: Cache API works on custom domains, not on *.workers.dev
    const ctx = locals.runtime.ctx;
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(cache.put(cacheKey as any, response.clone() as any));
      console.log(`💾 Caching cover: ${coverKey}`);
    }

    return response;
  } catch (error) {
    console.error('❌ Get cover error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get cover' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
