/**
 * vitest + jsdom setup for the web component tests (DESIGN.md §10).
 *
 * Nothing here fakes app behaviour: the tests run the real components against a
 * real in-memory SQLite database from `@vigor/db/testing`. This file only fills
 * the browser APIs jsdom does not implement.
 */

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom has no layout engine, so anything that measures reports zero. The
// charts draw from a viewBox and never read layout, but React Testing Library
// warns loudly without these.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// The Notifications adapter asks for this before scheduling anything.
if (!('Notification' in window)) {
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: Object.assign(
      vi.fn(),
      { permission: 'default', requestPermission: () => Promise.resolve('default' as const) },
    ),
  });
}
