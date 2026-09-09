import { useLocalSearchParams } from 'expo-router';

import { CoachThread } from '../../src/coach/CoachThread';
import { ErrorBanner, Screen } from '../../src/ui/components';

/**
 * The chat thread route — DESIGN.md §7.1. The screen itself is
 * `src/coach/CoachThread.tsx`; this file only supplies the id.
 */
export default function CoachConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();

  if (!conversationId) {
    return (
      <Screen>
        <ErrorBanner message="No conversation was passed to the coach." />
      </Screen>
    );
  }

  return <CoachThread conversationId={conversationId} />;
}
