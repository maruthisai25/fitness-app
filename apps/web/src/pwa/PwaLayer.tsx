/**
 * The PWA chrome, mounted once from `main.tsx` — deliberately outside `App`,
 * which owns routing and the five destinations (DESIGN.md §7.1). None of these
 * surfaces belong to a route: they are properties of the installed shell.
 *
 * Each child renders `null` until it has something to say, so in the normal
 * case this layer paints nothing at all.
 */
import type { ReactElement } from 'react';

import { InstallBanner } from './InstallBanner';
import { OfflineIndicator } from './OfflineIndicator';
import { UpdateToast } from './UpdateToast';
import { dockStyle } from './styles';

export function PwaLayer(): ReactElement {
  return (
    <>
      <OfflineIndicator />
      <div style={dockStyle}>
        {/* Update first: it is the more urgent of the two cards. */}
        <UpdateToast />
        <InstallBanner />
      </div>
    </>
  );
}
