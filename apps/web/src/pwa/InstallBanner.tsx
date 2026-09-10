/**
 * "Install VigorEngine" — a small dismissible banner shown only once the
 * browser has actually handed over a `beforeinstallprompt` event.
 */
import type { ReactElement } from 'react';

import {
  cardDetailStyle,
  cardStyle,
  cardTextStyle,
  cardTitleStyle,
  ghostButtonStyle,
  primaryButtonStyle,
} from './styles';
import { useInstallPrompt } from './useInstallPrompt';

export function InstallBanner(): ReactElement | null {
  const { canInstall, install, dismiss } = useInstallPrompt();
  if (!canInstall) return null;

  return (
    <div style={cardStyle} role="region" aria-label="Install VigorEngine">
      <div style={cardTextStyle}>
        <p style={cardTitleStyle}>Install VigorEngine</p>
        <p style={cardDetailStyle}>Runs offline from your home screen. Your data stays here.</p>
      </div>
      <button type="button" style={ghostButtonStyle} onClick={dismiss}>
        Not now
      </button>
      <button
        type="button"
        style={primaryButtonStyle}
        onClick={() => {
          // The browser owns the dialog from here; the hook clears the banner
          // whichever way the user answers.
          void install();
        }}
      >
        Install
      </button>
    </div>
  );
}
