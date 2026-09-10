/**
 * "Update available" toast. Accepting activates the waiting service worker and
 * reloads; declining keeps the running build for the rest of the session.
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
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

export function UpdateToast(): ReactElement | null {
  const { updateReady, updating, applyUpdate, dismiss } = useServiceWorkerUpdate();
  if (!updateReady) return null;

  return (
    <div style={cardStyle} role="status" aria-live="polite">
      <div style={cardTextStyle}>
        <p style={cardTitleStyle}>Update available</p>
        <p style={cardDetailStyle}>
          {updating ? 'Reloading…' : 'A new version of VigorEngine is ready.'}
        </p>
      </div>
      <button type="button" style={ghostButtonStyle} onClick={dismiss} disabled={updating}>
        Later
      </button>
      <button type="button" style={primaryButtonStyle} onClick={applyUpdate} disabled={updating}>
        Reload
      </button>
    </div>
  );
}
