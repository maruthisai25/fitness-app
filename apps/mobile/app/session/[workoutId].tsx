import { useLocalSearchParams, useRouter } from 'expo-router';

import { SessionMode } from '../../src/session/SessionMode';
import { ErrorBanner, Screen } from '../../src/ui/components';

/**
 * Session mode is a full-screen route outside the tab bar — DESIGN.md §7.1.
 * The screen itself is `src/session/SessionMode.tsx`; this file only supplies
 * the id and the way back.
 */
export default function SessionRoute() {
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const router = useRouter();

  if (!workoutId) {
    return (
      <Screen>
        <ErrorBanner message="No workout was passed to session mode." />
      </Screen>
    );
  }

  return (
    <SessionMode
      workoutId={workoutId}
      onExit={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }}
    />
  );
}
