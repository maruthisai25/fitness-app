/**
 * The session rest timer — DESIGN.md §7.3: "Rest timer uses
 * `expo-notifications` local scheduling so it fires with the screen off."
 *
 * The countdown on screen is derived from a target timestamp rather than a
 * tick counter, so backgrounding the app does not make it drift. The
 * notification is the part that actually reaches the user with the phone in a
 * pocket; it is scheduled through the `Notifications` platform adapter and
 * cancelled the moment the user skips the rest or confirms the next set.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Id } from '@vigor/core';

import { usePlatform } from '../db/AppDataProvider';
import { announce, useReducedMotion } from '../ui/useReducedMotion';

/** One scheduled request at a time; re-scheduling replaces it (idempotent by id). */
export const REST_NOTIFICATION_ID = 'vigor-rest-timer';

/**
 * How often the on-screen countdown redraws. A large numeral changing twice a
 * second is exactly the kind of unrequested movement "Reduce Motion" asks us
 * to damp, so with the setting on it steps once a second instead. The value
 * shown is derived from the target timestamp either way, so nothing drifts and
 * no information is lost — only the flicker.
 */
export const TICK_MS = 500;
export const REDUCED_MOTION_TICK_MS = 1000;

export interface RestTimerState {
  /** Seconds left, or null when no rest is running. */
  secondsLeft: number | null;
  /** The set the rest follows, so the UI can highlight the right row. */
  afterSetId: Id | null;
  /** True while the timer is at zero and waiting to be dismissed. */
  finished: boolean;
  start: (input: { afterSetId: Id; seconds: number; exerciseName: string }) => void;
  stop: () => void;
  /** True when the OS asks for reduced motion — the UI stops animating too. */
  reducedMotion: boolean;
}

export function useRestTimer(): RestTimerState {
  const { notifications } = usePlatform();
  const reducedMotion = useReducedMotion();
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [afterSetId, setAfterSetId] = useState<Id | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const announcedRef = useRef(false);

  const clearInterval_ = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (endsAt == null) {
      clearInterval_();
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      // The countdown is the one thing on this screen that changes without a
      // tap. A screen reader will not notice, so say it once, at the end.
      if (left === 0 && !announcedRef.current) {
        announcedRef.current = true;
        announce('Rest is up. Start your next set.');
      }
    };
    tick();
    intervalRef.current = setInterval(tick, reducedMotion ? REDUCED_MOTION_TICK_MS : TICK_MS);
    return clearInterval_;
  }, [endsAt, clearInterval_, reducedMotion]);

  const stop = useCallback(() => {
    setEndsAt(null);
    setAfterSetId(null);
    void notifications.cancel(REST_NOTIFICATION_ID);
  }, [notifications]);

  const start = useCallback(
    (input: { afterSetId: Id; seconds: number; exerciseName: string }) => {
      const seconds = Math.max(1, Math.round(input.seconds));
      const fireAt = new Date(Date.now() + seconds * 1000).toISOString();
      announcedRef.current = false;
      setAfterSetId(input.afterSetId);
      setEndsAt(Date.now() + seconds * 1000);
      void (async () => {
        // Ask once, quietly: without permission the on-screen countdown still
        // runs, it just will not reach a locked screen.
        if (!(await notifications.hasPermission())) {
          await notifications.requestPermission();
        }
        await notifications.schedule({
          id: REST_NOTIFICATION_ID,
          title: 'Rest is up',
          body: `Next set of ${input.exerciseName}.`,
          fireAt,
        });
      })();
    },
    [notifications],
  );

  useEffect(
    () => () => {
      void notifications.cancel(REST_NOTIFICATION_ID);
    },
    [notifications],
  );

  return {
    secondsLeft,
    afterSetId,
    finished: secondsLeft === 0,
    start,
    stop,
    reducedMotion,
  };
}
