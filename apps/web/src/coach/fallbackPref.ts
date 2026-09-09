/**
 * The Opus refusal-fallback toggle — DESIGN.md §6.1: "on by default; the
 * settings screen tells the user it is on and lets them switch it off."
 *
 * `ModelSettings.serverSideFallback` is a client request-shaping flag, not a
 * row in `packages/db`'s `settings` table (that table's columns are fixed by
 * DESIGN.md §4.1 and are out of this brief's directory). It is a genuine
 * per-device preference either way, so it lives in `localStorage` next to the
 * other per-viewer conveniences this app already keeps there.
 */

const STORAGE_KEY = 'vigor.ai.serverSideFallback';

/** DESIGN.md §6.1's default: the fallback beta is on unless the user turns it off. */
export function getServerSideFallbackPref(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function setServerSideFallbackPref(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Private browsing / storage blocked — the toggle just stops persisting.
  }
}
