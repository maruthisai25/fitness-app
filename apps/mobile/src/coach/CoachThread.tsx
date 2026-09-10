/**
 * The coach chat thread — DESIGN.md §7.1: "streaming assistant text, tool
 * activity chips, … 'Remembered: …' chips with undo, offline state, typed
 * error states".
 *
 * A thin route wrapper (`app/coach/[conversationId].tsx`) supplies the id;
 * everything else — the AI client, the coach deps, connectivity — comes from
 * hooks so a test can render this directly inside `TestProviders` with a fake
 * client injected through `AppDataProvider`'s `override.aiClient`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { AiError } from '@vigor/ai';
import type { Id } from '@vigor/core';

import { Button, ErrorBanner } from '../ui/components';
import { Body, Caption, EmptyState, WhyDisclosure } from '../ui/kit';
import { color, fontSize, fontWeight, HIT_TARGET, radius, space } from '../ui/tokens';
import { useReducedMotion } from '../ui/useReducedMotion';
import { useAiClient } from '../ai/useAiClient';
import { useOnlineStatus } from '../ai/useOnlineStatus';
import { useForgetMemory } from '../memories/useMemories';
import { buildTurnItems, rationaleFromToolResult } from './coachData';
import { useConversationStream } from './coachStream';
import { coachErrorAction } from './errorPresentation';
import { ToolChip, MessageBubble, RememberedChip } from './ChatComponents';
import { useMessagesQuery, useSendCoachMessage } from './useCoach';

export function CoachThread({ conversationId }: { conversationId: Id }) {
  const router = useRouter();
  const { hasApiKey, loading: clientLoading } = useAiClient();
  const online = useOnlineStatus();
  const messages = useMessagesQuery(conversationId);
  const send = useSendCoachMessage(conversationId);
  const stream = useConversationStream(conversationId);
  const forget = useForgetMemory();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const reducedMotion = useReducedMotion();

  const items = useMemo(() => buildTurnItems(messages.data ?? []), [messages.data]);

  useEffect(() => {
    // Following the stream means the view scrolls on its own several times a
    // turn. With Reduce Motion on it jumps instead of gliding.
    scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
  }, [items.length, stream.text, stream.tools.length, reducedMotion]);

  async function onSend() {
    const text = draft.trim();
    if (text.length === 0 || send.isPending) return;
    setDraft('');
    try {
      await send.mutateAsync(text);
    } catch {
      // Surfaced through `stream.error` already.
    }
  }

  const canType = hasApiKey && online;
  const canSend = canType && !send.isPending && draft.trim().length > 0;
  const error: AiError | null = stream.error;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {items.length === 0 && !stream.sending ? (
          <EmptyState
            title="Ask your coach anything"
            blurb="Training, nutrition, today's plan — it can see your history and act on it."
          />
        ) : null}

        {items.map((item) =>
          item.kind === 'user' ? (
            <MessageBubble key={item.messageId} role="user" text={item.text} />
          ) : (
            <MessageBubble key={item.messageId} role="assistant" text={item.text}>
              {item.tools.map((tool) => {
                const rationale = rationaleFromToolResult(tool.name, tool.resultText);
                const status = tool.ok == null ? 'ok' : tool.ok ? 'ok' : 'error';
                return (
                  <View key={tool.toolUseId} style={styles.toolBlock}>
                    <ToolChip name={tool.name} status={status} />
                    {rationale ? <WhyDisclosure rationale={rationale} /> : null}
                  </View>
                );
              })}
            </MessageBubble>
          ),
        )}

        {stream.sending ? (
          <>
            {stream.pendingUserText.length > 0 ? (
              <MessageBubble role="user" text={stream.pendingUserText} />
            ) : null}
            <MessageBubble role="assistant" text={stream.text}>
              {stream.tools.map((tool) => (
                <View key={tool.toolUseId} style={styles.toolBlock}>
                  <ToolChip name={tool.name} status={tool.status} />
                </View>
              ))}
              {stream.text.length === 0 && stream.tools.length === 0 ? (
                <ActivityIndicator
                  color={color.accent}
                  testID="coach-thinking"
                  accessibilityRole="progressbar"
                  accessibilityLabel="The coach is thinking"
                  accessibilityLiveRegion="polite"
                />
              ) : null}
            </MessageBubble>
          </>
        ) : null}

        {stream.refusal ? (
          <View
            style={styles.notice}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={stream.refusal.message}
          >
            <Caption>{stream.refusal.message}</Caption>
          </View>
        ) : null}

        {stream.remembered.map((chip) => (
          <RememberedChip
            key={chip.id}
            text={chip.text}
            onUndo={() => forget.mutate({ id: chip.id, reason: 'Undone from the chat chip' })}
          />
        ))}

        {error ? (
          <View style={styles.notice}>
            <ErrorBanner message={error.userMessage} />
            {coachErrorAction(error) === 'settings' ? (
              <Button
                label="Open settings"
                variant="secondary"
                onPress={() => router.push('/you/settings')}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {clientLoading ? null : !hasApiKey ? (
        <View style={styles.composerNotice}>
          <Body muted>Add your Anthropic key in You → Settings to use the coach.</Body>
          <Button
            label="Open settings"
            variant="secondary"
            onPress={() => router.push('/you/settings')}
          />
        </View>
      ) : !online ? (
        <View style={styles.composerNotice}>
          <Body muted>
            The coach needs a connection. Everything else in VigorEngine still works offline.
          </Body>
        </View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            testID="coach-input"
            accessibilityLabel="Message the coach"
            accessibilityHint="Ask about training, nutrition or today's plan"
            accessibilityState={{ disabled: !canType || send.isPending }}
            style={styles.input}
            placeholder="Ask your coach…"
            placeholderTextColor={color.textFaint}
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={canType && !send.isPending}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityHint="Sends your message to the coach"
            accessibilityState={{ disabled: !canSend, busy: send.isPending }}
            testID="coach-send"
            onPress={onSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend && styles.sendButtonDisabled,
              pressed && canSend && styles.sendButtonPressed,
            ]}
          >
            <Text maxFontSizeMultiplier={1.8} style={styles.sendLabel}>
              Send
            </Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl },
  toolBlock: { marginTop: space.xs },
  notice: { marginTop: space.md },
  composerNotice: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.surface,
  },
  input: {
    flex: 1,
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: HIT_TARGET,
    color: color.text,
    fontSize: fontSize.body,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: color.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    minHeight: HIT_TARGET,
    minWidth: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonPressed: { backgroundColor: color.accentPressed },
  sendLabel: {
    color: color.textOnAccent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
  },
});
