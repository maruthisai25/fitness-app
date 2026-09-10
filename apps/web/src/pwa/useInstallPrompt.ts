/**
 * Captures Chromium's `beforeinstallprompt` so the app can offer "Install
 * VigorEngine" at a moment of its own choosing instead of leaving the browser's
 * own affordance buried in a menu (DESIGN.md §7.4: the shell is a PWA).
 *
 * Nothing here talks to the network or to storage beyond one dismissal flag —
 * offline is the default state (DESIGN.md §2.4).
 */
import { useCallback, useEffect, useState } from 'react';

/**
 * Not in `lib.dom` — Chromium-only, and Safari/Firefox never fire it. Declared
 * to the shape the spec draft defines, narrowed to what we use.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Survives reloads so a dismissed banner does not reappear on every visit. */
const DISMISSED_KEY = 'vigor.pwa.installDismissed';

function readDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(DISMISSED_KEY) === '1';
  } catch {
    // Private mode / blocked storage: treat as "not dismissed" and move on.
    return false;
  }
}

function writeDismissed(): void {
  try {
    globalThis.localStorage?.setItem(DISMISSED_KEY, '1');
  } catch {
    // Nothing to do — the banner simply reappears next session.
  }
}

/** True when the document is already running from a home-screen/standalone launch. */
function isStandalone(): boolean {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return (
    globalThis.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag.
    (globalThis.navigator as { standalone?: boolean }).standalone === true
  );
}

export interface InstallPrompt {
  /** True only when a real prompt is held and the user has not dismissed it. */
  canInstall: boolean;
  /** Shows the browser's install dialog. Resolves to the user's choice. */
  install(): Promise<'accepted' | 'dismissed' | 'unavailable'>;
  /** Hides the banner for good on this browser profile. */
  dismiss(): void;
}

export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed() || isStandalone());

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event): void {
      // Without this the browser shows its own mini-infobar and never hands the
      // event over, so the banner below could never be offered.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    }
    function onInstalled(): void {
      setDeferred(null);
      setDismissed(true);
    }

    globalThis.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    globalThis.addEventListener('appinstalled', onInstalled);
    return () => {
      globalThis.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      globalThis.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A deferred prompt is single-use whatever the answer.
    setDeferred(null);
    if (outcome === 'dismissed') {
      setDismissed(true);
      writeDismissed();
    }
    return outcome;
  }, [deferred]);

  const dismiss = useCallback((): void => {
    setDismissed(true);
    writeDismissed();
  }, []);

  return { canInstall: deferred !== null && !dismissed, install, dismiss };
}
