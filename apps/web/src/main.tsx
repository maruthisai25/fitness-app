import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { newId } from '@vigor/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App';
import { DbProvider } from './db/provider';
import './index.css';

// TanStack Query over the repositories in both apps — DESIGN.md §7.2.
// Offline is the default state (DESIGN.md §2.4), so nothing refetches on focus.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/** Identifies this browser profile's session in local logs. Never leaves the device. */
export const SESSION_ID = newId();

const container = document.getElementById('root');
if (!container) {
  throw new Error('VigorEngine: #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DbProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DbProvider>
    </QueryClientProvider>
  </StrictMode>,
);
