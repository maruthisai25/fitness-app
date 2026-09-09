/**
 * Progress → Photos. DESIGN.md §7.4: "Photos stored in OPFS", addressed by the
 * same sandbox-relative ref mobile uses. Nothing here ever touches the network:
 * the only outbound host in the whole app is `api.anthropic.com` (DESIGN.md §8)
 * and no photo is ever part of a coach request.
 */

import type { LocalDate, ProgressPhoto, ProgressPhotoView } from '@vigor/core';
import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { Field, Select } from '../components/form';
import { Card, EmptyState, LinkButton, Notice, Section } from '../components/ui';
import { useDb } from '../db/provider';
import { useInvalidate } from '../eat/data';
import { webFileStore } from '../platform/fileStore';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useProgressPhotos } from './data';

const VIEWS: readonly ProgressPhotoView[] = ['front', 'side', 'back'];

const VIEW_LABEL: Record<ProgressPhotoView, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
};

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
export function photoRef(date: LocalDate, view: ProgressPhotoView, suffix: string, ext: string): string {
  return `photos/${date}-${view}-${suffix}.${ext}`;
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Reads one photo out of OPFS as a data URL. Returns null while loading or if it is gone. */
function usePhotoSource(ref: string | null): string | null {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (ref == null) {
      setSource(null);
      return;
    }
    void webFileStore.readBase64(ref).then((base64) => {
      if (cancelled) return;
      setSource(base64 == null ? null : `data:${mimeForRef(ref)};base64,${base64}`);
    });
    return () => {
      cancelled = true;
    };
  }, [ref]);
  return source;
}

export function PhotosPanel({ today }: { today: LocalDate }): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const photos = useProgressPhotos();
  const [date, setDate] = useState<LocalDate>(today);
  const [view, setView] = useState<ProgressPhotoView>('front');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [leftDate, setLeftDate] = useState<LocalDate | null>(null);
  const [rightDate, setRightDate] = useState<LocalDate | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<LocalDate, ProgressPhoto[]>();
    for (const photo of photos.data ?? []) {
      const list = map.get(photo.date) ?? [];
      list.push(photo);
      map.set(photo.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [photos.data]);

  const dates = byDate.map(([day]) => day);

  useEffect(() => {
    if (leftDate == null && dates.length > 0) setLeftDate(dates[dates.length - 1]);
    if (rightDate == null && dates.length > 0) setRightDate(dates[0]);
  }, [dates, leftDate, rightDate]);

  async function addPhoto(file: File): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const ref = photoRef(date, view, String(Date.now()), extensionOf(file.name));
      await webFileStore.write(ref, await fileToBase64(file), file.type || mimeForRef(ref));
      await repos.body.addPhoto({ date, view, fileRef: ref, note: null });
      await invalidate('savePhoto');
    } catch (error) {
      setProblem(
        `That photo could not be saved to this device: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: ProgressPhoto): Promise<void> {
    setBusy(true);
    try {
      await repos.body.removePhoto(photo.id);
      await webFileStore.remove(photo.fileRef);
      await invalidate('savePhoto');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Notice tone="accent">
        <strong>These photos never leave this device.</strong> They are written to this browser's
        private origin-private file system, they are not uploaded anywhere, and they are never part
        of anything the coach is sent. Clearing this site's storage deletes them.
      </Notice>

      <Section title="Add a photo" style={{ marginTop: space.xl }}>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: space.md }}>
            <Field label="Date">
              <input
                type="date"
                aria-label="Photo date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="tabular"
                style={{
                  width: '100%',
                  padding: `${space.sm}px ${space.md}px`,
                  borderRadius: radius.sm,
                  border: `1px solid ${themeColor.border}`,
                  background: themeColor.surface,
                  color: themeColor.text,
                  fontSize: fontSize.body,
                }}
              />
            </Field>
            <Field label="View">
              <Select value={view} onChange={(value) => setView(value as ProgressPhotoView)}>
                {VIEWS.map((option) => (
                  <option key={option} value={option}>
                    {VIEW_LABEL[option]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Take one now or pick from your library">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Progress photo"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void addPhoto(file);
              }}
              style={{ color: themeColor.text, fontSize: fontSize.label }}
            />
          </Field>
          {problem && (
            <p style={{ color: themeColor.bad, fontSize: fontSize.label }} role="status">
              {problem}
            </p>
          )}
        </Card>
      </Section>

      <Section title="Compare">
        {dates.length < 2 ? (
          <EmptyState>
            Two dates are needed to compare. Add another set of photos and they line up here.
          </EmptyState>
        ) : (
          <>
            <div style={{ display: 'flex', gap: space.lg, flexWrap: 'wrap', marginBottom: space.md }}>
              <div style={{ minWidth: 160 }}>
                <Field label="Then">
                  <Select value={leftDate ?? ''} onChange={(value) => setLeftDate(value)}>
                    {dates.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div style={{ minWidth: 160 }}>
                <Field label="Now">
                  <Select value={rightDate ?? ''} onChange={(value) => setRightDate(value)}>
                    {dates.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div style={{ minWidth: 160 }}>
                <Field label="View">
                  <Select value={view} onChange={(value) => setView(value as ProgressPhotoView)}>
                    {VIEWS.map((option) => (
                      <option key={option} value={option}>
                        {VIEW_LABEL[option]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.md }}>
              <ComparePane
                caption={leftDate ?? ''}
                photo={findPhoto(photos.data ?? [], leftDate, view)}
              />
              <ComparePane
                caption={rightDate ?? ''}
                photo={findPhoto(photos.data ?? [], rightDate, view)}
              />
            </div>
          </>
        )}
      </Section>

      <Section title="Gallery">
        {byDate.length === 0 ? (
          <EmptyState>No photos yet.</EmptyState>
        ) : (
          byDate.map(([day, entries]) => (
            <div key={day} style={{ marginBottom: space.xl }}>
              <p
                className="tabular"
                style={{
                  margin: `0 0 ${space.sm}px`,
                  color: themeColor.textMuted,
                  fontSize: fontSize.label,
                }}
              >
                {day}
              </p>
              <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap' }}>
                {entries.map((photo) => (
                  <div key={photo.id} style={{ width: 160 }}>
                    <PhotoImage photo={photo} />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: space.xs,
                      }}
                    >
                      <span style={{ color: themeColor.textMuted, fontSize: fontSize.caption }}>
                        {VIEW_LABEL[photo.view]}
                      </span>
                      <LinkButton tone="bad" onClick={() => void remove(photo)} disabled={busy}>
                        Delete
                      </LinkButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function findPhoto(
  photos: readonly ProgressPhoto[],
  date: LocalDate | null,
  view: ProgressPhotoView,
): ProgressPhoto | null {
  if (date == null) return null;
  return photos.find((photo) => photo.date === date && photo.view === view) ?? null;
}

function ComparePane({ caption, photo }: { caption: string; photo: ProgressPhoto | null }): ReactNode {
  return (
    <figure style={{ margin: 0 }}>
      {photo ? (
        <PhotoImage photo={photo} />
      ) : (
        <div
          style={{
            aspectRatio: '3 / 4',
            borderRadius: radius.md,
            border: `1px dashed ${themeColor.border}`,
            display: 'grid',
            placeItems: 'center',
            color: themeColor.textFaint,
            fontSize: fontSize.caption,
            textAlign: 'center',
            padding: space.md,
          }}
        >
          No photo from this view on this date
        </div>
      )}
      <figcaption
        className="tabular"
        style={{ color: themeColor.textMuted, fontSize: fontSize.caption, marginTop: space.xs }}
      >
        {caption}
      </figcaption>
    </figure>
  );
}

function PhotoImage({ photo }: { photo: ProgressPhoto }): ReactNode {
  const source = usePhotoSource(photo.fileRef);
  if (source == null) {
    return (
      <div
        style={{
          aspectRatio: '3 / 4',
          borderRadius: radius.md,
          background: themeColor.surfaceRaised,
          display: 'grid',
          placeItems: 'center',
          color: themeColor.textFaint,
          fontSize: fontSize.caption,
          textAlign: 'center',
          padding: space.md,
        }}
      >
        The file for this entry is missing from this device
      </div>
    );
  }
  return (
    <img
      src={source}
      alt={`${VIEW_LABEL[photo.view]} view, ${photo.date}`}
      style={{
        width: '100%',
        borderRadius: radius.md,
        display: 'block',
        border: `1px solid ${themeColor.border}`,
      }}
    />
  );
}
