/// <reference types="@cloudflare/workers-types" />

declare global {
  interface Env {
    AUDIO_BUCKET: R2Bucket;
  }

  // Global Cloudflare Worker environment
  const AUDIO_BUCKET: R2Bucket;
}

export {};