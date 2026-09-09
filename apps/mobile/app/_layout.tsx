import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { color } from '../src/ui/tokens';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider, useAppData } from '../src/db/AppDataProvider';
import { ErrorBanner, LoadingScreen, Screen } from '../src/ui/components';
import { CoachLauncher } from '../src/ui/CoachLauncher';
// Side-effect only — registers the coach's Today-tab slots (DESIGN.md §7.1,
// phase 2 and 3 rows of §9) before Today can render its `CoachPlanSlot`.
import '../src/coach/registerCoachUi';

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

/**
 * Waits for the database to finish migrating, then sends a user who has not
 * finished onboarding to `/onboarding/welcome` (DESIGN.md §7.1). Once
 * onboarding completes, the API-key screen `router.replace`s back to the
 * tabs, so this only ever fires once per fresh install.
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const state = useAppData();
  const router = useRouter();
  const redirected = useRef(false);

  useEffect(() => {
    if (state.status !== 'ready' || redirected.current) return;
    void state.repos.settings.getAll().then((settings) => {
      if (!settings.onboardingComplete && !redirected.current) {
        redirected.current = true;
        router.replace('/onboarding/welcome');
      }
    });
  }, [state, router]);

  if (state.status === 'loading') {
    return <LoadingScreen label="Loading VigorEngine…" />;
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <ErrorBanner message={`Could not open the database: ${state.error.message}`} />
      </Screen>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AppDataProvider>
          <StatusBar style="light" />
          <OnboardingGate>
            <View style={{ flex: 1 }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.bg },
                }}
              >
                {/* Reachable from every screen (DESIGN.md §7.1) via `CoachLauncher`. */}
                <Stack.Screen name="coach" options={{ presentation: 'modal', headerShown: false }} />
              </Stack>
              <CoachLauncher />
            </View>
          </OnboardingGate>
        </AppDataProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
