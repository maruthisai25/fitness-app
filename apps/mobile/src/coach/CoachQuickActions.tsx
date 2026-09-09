/**
 * "Make it shorter" / "I'm tired today" — DESIGN.md §7.1 Today tab, phase 3
 * row of §9. Registered as `CoachQuickActionsSlot` (see `registerCoachUi.ts`).
 *
 * Both buttons send a plain-language ask; the coach finds today's workout
 * with `get_workouts` and calls `adjust_workout` itself (DESIGN.md §6.3) — the
 * date is already in its context block, so nothing here needs to pass an id.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { isAiError } from '@vigor/ai';

import type { CoachQuickActionsSlotProps } from '../ui/slots';
import { Button, ErrorBanner } from '../ui/components';
import { space } from '../ui/tokens';
import { useAiClient } from '../ai/useAiClient';
import { useOnlineStatus } from '../ai/useOnlineStatus';
import { coachErrorAction } from './errorPresentation';
import { useDefaultConversationId, useSendCoachMessage } from './useCoach';

const SHORTER_PROMPT =
  "Can you make today's workout shorter? I have less time than I planned for.";
const TIRED_PROMPT =
  "I'm feeling tired today — can you lighten today's workout without dropping it entirely?";

export function CoachQuickActions({ onAdjusted }: CoachQuickActionsSlotProps) {
  const router = useRouter();
  const { hasApiKey } = useAiClient();
  const online = useOnlineStatus();
  const conversationId = useDefaultConversationId();
  const send = useSendCoachMessage(conversationId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [showSettingsLink, setShowSettingsLink] = useState(false);

  if (!hasApiKey || !online) return null;

  async function ask(prompt: string) {
    if (conversationId == null || send.isPending) return;
    setError(null);
    setShowSettingsLink(false);
    try {
      const result = await send.mutateAsync(prompt);
      if (result.refusal) {
        setError(result.refusal.message);
        return;
      }
      onAdjusted();
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
    <View style={{ marginTop: space.md }}>
      {error ? <ErrorBanner message={error} /> : null}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Make it shorter"
            variant="secondary"
            onPress={() => void ask(SHORTER_PROMPT)}
            loading={send.isPending}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="I'm tired today"
            variant="secondary"
            onPress={() => void ask(TIRED_PROMPT)}
            loading={send.isPending}
          />
        </View>
      </View>
      {showSettingsLink ? (
        <Button label="Open settings" variant="secondary" onPress={() => router.push('/you/settings')} />
      ) : null}
    </View>
  );
}
