import type { SecStreamSession } from '../../durable-objects/SecStreamSession.js';

/**
 * Validate if a string is a valid Durable Object ID (64 hex digits)
 */
function isValidDurableObjectId(id: string): boolean {
  return /^[0-9a-f]{64}$/i.test(id);
}

/**
 * Get a Durable Object stub for a session
 * @param namespace - The DO namespace binding
 * @param sessionId - The session ID (hex string from newUniqueId().toString())
 * @returns DO stub
 */
export function getSessionDO(namespace: DurableObjectNamespace, sessionId: string): DurableObjectStub<SecStreamSession> {
  // Validate the DO ID format
  if (!isValidDurableObjectId(sessionId)) {
    console.error(`❌ Invalid Durable Object ID: "${sessionId}" (length: ${sessionId.length})`);
    console.error(`Expected: 64 hexadecimal characters`);
    throw new Error(`Invalid Durable Object ID: must be 64 hex digits, got "${sessionId.substring(0, 20)}..."`);
  }

  // Reconstruct the DO ID from the hex string
  // IMPORTANT: Use idFromString, not idFromName!
  // idFromName creates a different ID from the same string
  const id = namespace.idFromString(sessionId);
  return namespace.get(id) as DurableObjectStub<SecStreamSession>;
}

/**
 * Create a new session DO with a generated ID
 * @param namespace - The DO namespace binding
 * @returns DO stub and generated session ID
 */
export function createSessionDO(namespace: DurableObjectNamespace): {
  stub: DurableObjectStub<SecStreamSession>;
  sessionId: string;
} {
  // Generate a new unique ID for the session
  const id = namespace.newUniqueId();
  const sessionId = id.toString();
  return {
    stub: namespace.get(id) as DurableObjectStub<SecStreamSession>,
    sessionId,
  };
}
