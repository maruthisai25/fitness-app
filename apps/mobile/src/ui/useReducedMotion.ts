/**
 * "Reduce Motion" — the OS-level accessibility switch (iOS Settings →
 * Accessibility → Motion, Android → Remove animations).
 *
 * Two things in VigorEngine move on their own: the rest timer, which redraws a
 * large numeral twice a second while you wait between sets, and the PR
 * celebration on the finish summary, which slides and fades in. Both consult
 * this hook; with the switch on, the countdown steps once a second and the
 * celebration simply appears, already in place. Nothing is hidden either way —
 * the information is identical, only the movement goes.
 *
 * The value is read once on mount and then kept current through the
 * `reduceMotionChanged` event, so toggling the setting while the app is open
 * takes effect without a restart.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * `null` until the OS has answered — there is no synchronous read. Callers
 * that must not commit to an animation before they know (the PR celebration,
 * which only ever plays once) wait for a boolean; callers where guessing
 * "motion is fine" for one frame costs nothing use `useReducedMotion` below.
 */
export function useReducedMotionSetting(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(value);
      })
      // An older host without the API is not a reason to crash a workout.
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduced(value);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/** The same setting, defaulting to "motion is allowed" until it is known. */
export function useReducedMotion(): boolean {
  return useReducedMotionSetting() ?? false;
}

/**
 * Speaks one sentence through the screen reader without moving focus — used
 * for the things a sighted user sees change on their own (rest is up, a PR
 * landed). Safe to call when no screen reader is running.
 */
export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}
