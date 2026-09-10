/**
 * Session mode's route, in a module of its own.
 *
 * Today, Train and the coach rail all link into session mode, and a link is not
 * a reason to download the whole flow: keeping this next to the component would
 * pull `SessionMode` — the store, the rest timer, the substitution sheet — into
 * the first chunk through those four static imports.
 */

import type { Id } from '@vigor/core';

export function sessionPath(workoutId: Id): string {
  return `/session/${workoutId}`;
}
