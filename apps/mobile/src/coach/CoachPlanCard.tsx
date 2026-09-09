/**
 * "Ask the coach for today's workout" — DESIGN.md §7.1 Today tab, phase 2 row
 * of §9. Registered as `CoachPlanSlot` (see `registerCoachUi.ts`), so it
 * renders above the offline planner's "Plan today's workout" button.
 *
 * `propose_workout` writes the planned session straight into `workouts`
 * (DESIGN.md §6.3), so once the turn succeeds `onPlanned()` is all this needs
 * to call — Today's own query refetches and the existing engine-rendered
 * card (Why?, Start button) takes over exactly as it does for the offline
 * planner. This component only owns asking, loading, refusal and error.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { isAiError } from '@vigor/ai';

import type { CoachPlanSlotProps } from '../ui/slots';
import { Button, ErrorBanner } from '../ui/components';
import { Caption } from '../ui/kit';
import { space } from '../ui/tokens';
import { useAiClient } from '../ai/useAiClient';
import { useOnlineStatus } from '../ai/useOnlineStatus';
import { coachErrorAction } from './errorPresentation';
import { useDefaultConversationId, useSendCoachMessage } from './useCoach';

const ASK_PROMPT =
  "Plan today's workout for me. Look at how my training has gone lately and today's readiness before you decide.";

export function CoachPlanCard({ onPlanned }: CoachPlanSlotProps) {
  const router = useRouter();
  const { hasApiKey } = useAiClient();
  const online = useOnlineStatus();
  const conversationId = useDefaultConversationId();
  const send = useSendCoachMessage(conversationId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [showSettingsLink, setShowSettingsLink] = useState(false);

  if (!hasApiKey) {
    return (
      <View style={{ marginBottom: space.md }}>
        <Caption>Add your Anthropic key in You → Settings to ask the coach for a workout.</Caption>
      </View>
    );
  }
  if (!online) {
    return (
      <View style={{ marginBottom: space.md }}>
        <Caption>The coach needs a connection — the offline planner below still works.</Caption>
      </View>
    );
  }

  async function ask() {
    if (conversationId == null) return;
    setError(null);
    setShowSettingsLink(false);
    try {
      const result = await send.mutateAsync(ASK_PROMPT);
      if (result.refusal) {
        setError(result.refusal.message);
        return;
      }
      onPlanned();
    } catch (cause) {
      if (isAiError(cause)) {
        setError(cause.userMessage);
        setShowSettingsLink(coachErrorAction(cause) === 'settings');
      } else {
        setError('Could not reach the coach.');
      }
    }
  }

  return (
    <View style={{ marginBottom: space.md }}>
      {error ? <ErrorBanner message={error} /> : null}
      <Button
        label="Ask the coach for today's workout"
        onPress={ask}
        loading={send.isPending || conversationId == null}
      />
      {showSettingsLink ? (
        <Button label="Open settings" variant="secondary" onPress={() => router.push('/you/settings')} />
      ) : null}
    </View>
  );
}
