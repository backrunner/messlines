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
 * Uses multiple checks to reliably detect dev vs production
 */
export function isDevMode(locals: any): boolean {
  // Check 1: If running in Node.js (dev), process.env.NODE_ENV will be available
  // In Cloudflare Workers (prod), there's no process.env
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    return true;
  }

  // Check 2: Astro dev mode check - import.meta.env.DEV is available
  // This is replaced at build time by Vite/Astro
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return true;
  }

  // Check 3: If SECSTREAM_SESSIONS is not available, definitely dev mode
  if (!locals.runtime?.env?.SECSTREAM_SESSIONS) {
    return true;
  }

  // Check 4: Check if AUDIO_BUCKET is missing (R2 not available in local dev)
  if (!locals.runtime?.env?.AUDIO_BUCKET) {
    return true;
  }

  // Default to production mode
  return false;
}

/**
 * Create a new session (works in both dev and prod)
 * Returns the DO ID (or session ID in dev mode) to use for routing
 */
export async function createSession(
  sessionId: string,
  audioKeys: string[],
  locals: any
): Promise<string> {
  if (isDevMode(locals)) {
    console.log('🔧 [DEV MODE] Using in-memory session storage');
    // In dev mode, use the provided sessionId as the doId
    devSessionStorage.createSession(sessionId, sessionId, audioKeys);
    return sessionId;
  } else {
    console.log('☁️ [PRODUCTION] Using Durable Object session storage');
    const sessionsDO = locals.runtime.env.SECSTREAM_SESSIONS;
    // Generate a proper DO ID
    const { stub: sessionDO, sessionId: doId } = createSessionDO(sessionsDO);
    await sessionDO.createSession(doId, sessionId, audioKeys);
    return doId;
  }
}

/**
 * Get session metadata (works in both dev and prod)
 */
export async function getSessionMetadata(
  doId: string,
  locals: any
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
  locals: any
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
