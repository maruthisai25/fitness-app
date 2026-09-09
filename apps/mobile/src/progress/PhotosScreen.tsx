/**
 * Progress photos — DESIGN.md §7.3: stored under the app sandbox's `photos/`
 * directory and referenced by a relative path; §8: nothing leaves the device.
 *
 * Capture or pick a front, side or back shot for a date, browse the gallery by
 * date, and put any two dates next to each other.
 */
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { queryKeys, type LocalDate, type ProgressPhoto, type ProgressPhotoView } from '@vigor/core';

import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import { absoluteUriFor } from '../platform/fileStore';
import { ErrorBanner, LoadingScreen, Screen, ScreenBlurb, ScreenTitle } from '../ui/components';
import { DateStepper, formatShortDate } from '../ui/DateStepper';
import {
  ActionRow,
  Caption,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  EmptyState,
  InlineAction,
  Note,
  ErrorScreen,
} from '../ui/primitives';
import { color, fontSize, radius, space } from '../ui/tokens';

const VIEWS: readonly ProgressPhotoView[] = ['front', 'side', 'back'];

const VIEW_LABEL: Record<ProgressPhotoView, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
};

/** Sandbox-relative, forward-slash ref — the only path shape `FileStore` takes. */
export function photoRef(date: LocalDate, view: ProgressPhotoView, stamp: number): string {
  return `photos/${date}-${view}-${stamp}.jpg`;
}

function PhotoTile({ photo, caption }: { photo: ProgressPhoto | null; caption: string }) {
  return (
    <View style={styles.tile}>
      {photo ? (
        <Image
          accessibilityLabel={`${VIEW_LABEL[photo.view]} photo from ${photo.date}`}
          source={{ uri: absoluteUriFor(photo.fileRef) }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.placeholderText}>No photo</Text>
        </View>
      )}
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

export function PhotosScreen() {
  const repos = useRepos();
  const { clock, fileStore } = usePlatform();
  const invalidate = useInvalidator();
  const today = clock.today();

  const [date, setDate] = useState<LocalDate>(today);
  const [view, setView] = useState<ProgressPhotoView>('front');
  const [compareLeft, setCompareLeft] = useState<LocalDate | null>(null);
  const [compareRight, setCompareRight] = useState<LocalDate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photos = useQuery({
    queryKey: queryKeys.progressPhotos(),
    queryFn: () => repos.body.listPhotos(),
  });

  const rows = photos.data ?? [];
  const dates = [...new Set(rows.map((photo) => photo.date))].sort().reverse();

  function photoFor(onDate: LocalDate | null, forView: ProgressPhotoView): ProgressPhoto | null {
    if (!onDate) return null;
    return rows.find((photo) => photo.date === onDate && photo.view === forView) ?? null;
  }

  async function store(asset: ImagePicker.ImagePickerAsset): Promise<void> {
    if (!asset.base64) {
      setError('That image came back without any data. Try again.');
      return;
    }
    const ref = photoRef(date, view, Date.now());
    await fileStore.write(ref, asset.base64, 'image/jpeg');
    const existing = photoFor(date, view);
    if (existing) {
      await fileStore.remove(existing.fileRef);
      await repos.body.updatePhoto(existing.id, { fileRef: ref });
    } else {
      await repos.body.addPhoto({ date, view, fileRef: ref });
    }
    invalidate('savePhoto');
  }

  async function capture(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(
          'Camera access is off. Turn it on in your device settings, or pick from the library instead.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]) return;
      await store(result.assets[0]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function pick(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          'Photo library access is off. Turn it on in your device settings to pick a photo.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]) return;
      await store(result.assets[0]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: ProgressPhoto): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fileStore.remove(photo.fileRef);
      await repos.body.removePhoto(photo.id);
      invalidate('savePhoto');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (photos.isPending) return <LoadingScreen label="Loading photos…" />;
  if (photos.error)
    return <ErrorScreen message={`Could not load photos: ${photos.error.message}`} />;

  const current = photoFor(date, view);

  return (
    <Screen>
      <ScreenTitle>Photos</ScreenTitle>
      <ScreenBlurb>
        Front, side and back shots for a date, so you can see change the scale does not show.
      </ScreenBlurb>

      <Note tone="good">
        Photos never leave this device. They are written into the app&apos;s own storage, are not
        uploaded anywhere, and are not sent to the coach — the only thing that ever leaves is text
        you type into a coach message.
      </Note>

      {error ? <ErrorBanner message={error} /> : null}

      <DateStepper date={date} today={today} onChange={setDate} allowFuture={false} />

      <ChipRow>
        {VIEWS.map((option) => (
          <Chip
            key={option}
            label={VIEW_LABEL[option]}
            selected={view === option}
            onPress={() => setView(option)}
          />
        ))}
      </ChipRow>

      <Card>
        <CardTitle>{`${VIEW_LABEL[view]} · ${formatShortDate(date)}`}</CardTitle>
        <PhotoTile photo={current} caption={current ? current.fileRef : 'Nothing here yet'} />
        <ActionRow>
          <InlineAction label="Take a photo" disabled={busy} onPress={() => void capture()} />
          <InlineAction label="Pick from library" disabled={busy} onPress={() => void pick()} />
          {current ? (
            <InlineAction
              label="Delete"
              tone="bad"
              disabled={busy}
              onPress={() => void remove(current)}
            />
          ) : null}
        </ActionRow>
      </Card>

      {dates.length >= 2 ? (
        <Card>
          <CardTitle>Compare two dates</CardTitle>
          <Caption>Pick a date on the left, then one on the right.</Caption>
          <ChipRow>
            {dates.slice(0, 20).map((option) => (
              <Chip
                key={`left-${option}`}
                label={formatShortDate(option)}
                selected={compareLeft === option}
                onPress={() => setCompareLeft(option)}
              />
            ))}
          </ChipRow>
          <ChipRow>
            {dates.slice(0, 20).map((option) => (
              <Chip
                key={`right-${option}`}
                label={formatShortDate(option)}
                selected={compareRight === option}
                onPress={() => setCompareRight(option)}
              />
            ))}
          </ChipRow>
          <View style={styles.compareRow}>
            <PhotoTile
              photo={photoFor(compareLeft, view)}
              caption={compareLeft ? formatShortDate(compareLeft) : 'Pick a date'}
            />
            <PhotoTile
              photo={photoFor(compareRight, view)}
              caption={compareRight ? formatShortDate(compareRight) : 'Pick a date'}
            />
          </View>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No photos yet"
          detail="Same spot, same light, same time of day. Every four weeks is plenty."
        />
      ) : (
        <Card>
          <CardTitle>Gallery</CardTitle>
          {dates.map((day) => (
            <View key={day}>
              <Caption>{formatShortDate(day)}</Caption>
              <View style={styles.compareRow}>
                {VIEWS.map((option) => (
                  <PhotoTile
                    key={`${day}-${option}`}
                    photo={photoFor(day, option)}
                    caption={VIEW_LABEL[option]}
                  />
                ))}
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    marginTop: space.sm,
  },
  image: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: color.surfaceRaised,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  placeholderText: {
    color: color.textFaint,
    fontSize: fontSize.caption,
  },
  caption: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: space.xs,
  },
  compareRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
});
