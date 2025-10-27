import { WorkerSessionManager } from './worker-session-manager';

/**
 * Global WorkerSessionManager instance
 * Shared across all API requests in the same worker instance
 *
 * Each worker instance has its own memory space, so this is truly global
 * within a worker but isolated across different worker instances
 */
export const globalWorkerSessionManager = new WorkerSessionManager();
