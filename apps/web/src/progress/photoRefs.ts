/**
 * How a progress photo is named and typed on the web — DESIGN.md §4.1
 * (`progress_photos.fileRef` is "an app-sandbox relative path") and §7.4
 * ("Photos stored in OPFS").
 *
 * Its own module because both Progress → Photos and You → Export/Import need
 * it: the export reads every `fileRef` back out of OPFS and the import writes
 * them again, and neither should drag the photo comparison screen into the
 * other route's bundle.
 */

import type { LocalDate, ProgressPhotoView } from '@vigor/core';

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export function extensionOf(fileName: string, fallback = 'jpg'): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match ? match[1].toLowerCase() : fallback;
}

export function mimeForRef(ref: string): string {
  return MIME_BY_EXTENSION[extensionOf(ref)] ?? 'image/jpeg';
}

/** `photos/2026-09-10-front-<suffix>.jpg` — the sandbox-relative ref DESIGN.md §4.1 wants. */
export function photoRef(
  date: LocalDate,
  view: ProgressPhotoView,
  suffix: string,
  ext: string,
): string {
  return `photos/${date}-${view}-${suffix}.${ext}`;
}
