
/**
 * Main Database Module
 * Exports connection pool, types, and helper functions.
 */

export * from './types';
export * from './pool';
export * from './queries';

// Re-export query specifically as default or named for backward compatibility if needed
import { query } from './queries';
export { query };
