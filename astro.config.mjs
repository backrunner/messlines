// @ts-check
import { defineConfig } from 'astro/config';
import { execSync } from 'child_process';

import react from '@astrojs/react';

import cloudflare from '@astrojs/cloudflare';

// Get git commit hash at build time
const getCommitHash = () => {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch (error) {
    console.warn('Unable to get git commit hash:', error);
    return 'unknown';
  }
};

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  adapter: cloudflare({
    workerEntryPoint: {
      path: 'src/worker.ts',
      namedExports: ['SecStreamSession']
    }
  }),
  output: 'server',
  vite: {
    define: {
      // Inject commit hash at build time
      '__BUILD_COMMIT__': JSON.stringify(getCommitHash()),
    },
    // Configure Vite to properly handle Web Workers
    worker: {
      format: 'es', // Use ES modules for workers
    },
    optimizeDeps: {
      // Exclude from pre-bundling to preserve worker imports
      exclude: ['secstream', '@jsquash/webp', '@jsquash/avif', '@jsquash/png', '@jsquash/jpeg'],
    },
  },
});
