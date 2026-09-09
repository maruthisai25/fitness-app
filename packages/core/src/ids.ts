import { uuidv7 } from 'uuidv7';

import type { Id } from './types';

/**
 * Every id in VigorEngine is a UUID v7 string (DESIGN.md §4): time-ordered, so
 * rows sort by creation without a separate sequence column.
 */
export function newId(): Id {
  return uuidv7();
}

/** Loose shape check for a UUID string. Import/restore validates with this. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** True when `value` is a UUID whose version nibble is 7. */
export function isUuidV7(value: string): boolean {
  return isUuid(value) && value[14] === '7';
}
