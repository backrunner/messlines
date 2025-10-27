import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/**
 * Get a Durable Object stub for a session
 * @param namespace - The DO namespace binding
 * @param sessionId - The session ID (hex string from newUniqueId().toString())
 * @returns DO stub
 */
export function getSessionDO(namespace: DurableObjectNamespace, sessionId: string) {
  // Reconstruct the DO ID from the hex string
  // IMPORTANT: Use idFromString, not idFromName!
  // idFromName creates a different ID from the same string
  const id = namespace.idFromString(sessionId);
  return namespace.get(id);
}

/**
 * Create a new session DO with a generated ID
 * @param namespace - The DO namespace binding
 * @returns DO stub and generated session ID
 */
export function createSessionDO(namespace: DurableObjectNamespace) {
  // Generate a new unique ID for the session
  const id = namespace.newUniqueId();
  const sessionId = id.toString();
  return {
    stub: namespace.get(id),
    sessionId,
  };
}
