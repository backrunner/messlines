import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { SecStreamSession } from './durable-objects/SecStreamSession';

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);

  return {
    default: {
      async fetch(request, env, ctx) {
        return handle(manifest, app, request as any, env as any, ctx);
      }
    } satisfies ExportedHandler<Env>,
    SecStreamSession,
  };
}
