// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  adapter: cloudflare(),
  output: 'server',
  vite: {
    // Configure Vite to properly handle Web Workers
    worker: {
      format: 'es', // Use ES modules for workers
    },
    optimizeDeps: {
      // Exclude secstream and jsquash from pre-bundling to preserve worker imports
      exclude: ['secstream', '@jsquash/webp', '@jsquash/avif', '@jsquash/png', '@jsquash/jpeg'],
    },
  },
});
