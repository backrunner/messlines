/**
 * Environment detection and session storage abstraction
 *
 * This module provides a unified interface for session storage that works
 * in both development and production environments.
 *
 * - Production: Uses Cloudflare Durable Objects
 * - Development: Uses in-memory storage
 */

import { devSessionStorage } from './dev-session-storage.js';
import { createSessionDO, getSessionDO } from './durable-objects.js';

export interface SessionMetadata {
  sessionId: string;
  audioKeys: string[];
  createdAt: number;
}

/**
 * Check if we're running in development mode
 * Uses Cloudflare-specific bindings as the primary indicator
 */
export function isDevMode(locals: App.Locals): boolean {
  // Primary check: If both DO and R2 bindings exist, we're in production
  const hasDO = !!locals.runtime?.env?.SECSTREAM_SESSIONS;
  const hasR2 = !!locals.runtime?.env?.AUDIO_BUCKET;

  // If we have both Cloudflare bindings, definitely production
  if (hasDO && hasR2) {
    console.log('🌐 Environment: PRODUCTION (Cloudflare Workers)');
    return false;
  }

  // Otherwise, it's development mode
  console.log('💻 Environment: DEVELOPMENT (Local)');
  return true;
}

/**
 * Create a new session (works in both dev and prod)
 * Returns the DO ID (or session ID in dev mode) to use for routing
 */
export async function createSession(
  sessionId: string,
  audioKeys: string[],
  locals: App.Locals
): Promise<string> {
  if (isDevMode(locals)) {
    console.log(`🔧 [DEV MODE] Creating in-memory session: ${sessionId}`);
    // In dev mode, use the provided sessionId as the doId
    devSessionStorage.createSession(sessionId, sessionId, audioKeys);
    console.log(`✅ [DEV MODE] Session created, returning ID: ${sessionId}`);
    return sessionId;
  } else {
    console.log(`☁️ [PRODUCTION] Creating Durable Object session...`);
    const sessionsDO = locals.runtime.env.SECSTREAM_SESSIONS;
    // Generate a proper DO ID
    const { stub: sessionDO, sessionId: doId } = createSessionDO(sessionsDO);
    console.log(`📝 Generated DO ID: ${doId} (length: ${doId.length})`);
    console.log(`📝 Internal session ID: ${sessionId}`);
    await sessionDO.createSession(doId, sessionId, audioKeys);
    console.log(`✅ [PRODUCTION] Session created, returning DO ID: ${doId}`);
    return doId;
  }
}

/**
 * Get session metadata (works in both dev and prod)
 */
export async function getSessionMetadata(
  doId: string,
  locals: App.Locals
): Promise<SessionMetadata> {
  if (isDevMode(locals)) {
    console.log('🔧 [DEV MODE] Fetching from in-memory storage');
    return devSessionStorage.getSessionMetadata(doId);
  } else {
    console.log('☁️ [PRODUCTION] Fetching from Durable Object');
    const sessionsDO = locals.runtime.env.SECSTREAM_SESSIONS;
    const sessionDO = getSessionDO(sessionsDO, doId);
    return await sessionDO.getSessionMetadata(doId);
  }
}

/**
 * Validate session exists and is not expired (works in both dev and prod)
 */
export async function validateSession(
  doId: string,
  locals: App.Locals
): Promise<boolean> {
  if (isDevMode(locals)) {
    console.log('🔧 [DEV MODE] Validating in memory');
    return devSessionStorage.validateSession(doId);
  } else {
    console.log('☁️ [PRODUCTION] Validating in Durable Object');
    const sessionsDO = locals.runtime.env.SECSTREAM_SESSIONS;
    const sessionDO = getSessionDO(sessionsDO, doId);
    return await sessionDO.validateSession(doId);
  }
}
