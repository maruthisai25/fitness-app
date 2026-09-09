/**
 * The coach chat — DESIGN.md §7.1, §9 phase 2: conversation list, streaming
 * assistant text, tool activity chips, a "Why?" disclosure on any proposed
 * workout, "Remembered: …" chips with undo, the offline/no-key states, and
 * typed `AiError` rendering.
 */

import { isAiError } from '@vigor/ai';
import { radius, space } from '@vigor/ui-tokens';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, type Id } from '@vigor/core';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { Card, EmptyState, WhyDisclosure } from '../components/ui';
import { useRepos } from '../data/hooks';
import { sessionPath } from '../session/SessionMode';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useCoach } from './CoachProvider';
import { buildTranscript, type ChatBlock } from './transcript';
import { useConversationList, useConversationMessages } from './useConversations';
import { describeToolResult, describeToolStart } from './toolPresentation';
import { useCoachTurn, type MemoryChip } from './useCoachTurn';

export function ChatPanel(): ReactNode {
  const { ready, hasKey, online, client } = useCoach();
  const repos = useRepos();
  const queryClient = useQueryClient();
  const { data: conversations } = useConversationList();
  const [conversationId, setConversationId] = useState<Id | null>(null);
  const { data: messages } = useConversationMessages(conversationId);
  const { live, busy, chips, send, saveProposedMemory, undoRememberedMemory, dismissChip } =
    useCoachTurn();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (conversationId != null) return;
    let cancelled = false;
    void repos.conversations.latest().then(async (latest) => {
      const conversation = latest ?? (await repos.conversations.create());
      if (!cancelled) setConversationId(conversation.id);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, repos]);

  useEffect(() => {
    // jsdom (component tests) has no `scrollIntoView` implementation.
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, live?.text, live?.toolCalls.length]);

  async function newChat(): Promise<void> {
    const conversation = await repos.conversations.create();
    await queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
    setConversationId(conversation.id);
  }

  async function submit(): Promise<void> {
    const text = draft.trim();
    if (text.length === 0 || conversationId == null || busy) return;
    setDraft('');
    await send(conversationId, text);
  }

  const blocks: ChatBlock[] = messages ? buildTranscript(messages) : [];
  const canSend = ready && hasKey && online && client != null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          padding: `${space.sm}px ${space.md}px`,
          borderBottom: `1px solid ${themeColor.border}`,
        }}
      >
        <select
          aria-label="Conversation"
          value={conversationId ?? ''}
          onChange={(event) => setConversationId(event.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: `${space.xs}px ${space.sm}px`,
            borderRadius: radius.sm,
            border: `1px solid ${themeColor.border}`,
            background: themeColor.surfaceRaised,
            color: themeColor.text,
            fontSize: fontSize.label,
          }}
        >
          {(conversations ?? []).map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void newChat()} style={smallButton}>
          New chat
        </button>
      </div>

      {!ready ? null : !hasKey ? (
        <StatusBanner>
          The coach needs an API key.{' '}
          <Link to="/you/settings" style={{ color: themeColor.accent }}>
            Add one in Settings
          </Link>{' '}
          — everything else in VigorEngine keeps working without it.
        </StatusBanner>
      ) : !online ? (
        <StatusBanner>
          You are offline, so the coach cannot reach api.anthropic.com right now. Your training and
          nutrition logging still work — this picks back up once you have a connection.
        </StatusBanner>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: space.md }}>
        {blocks.length === 0 && !live && (
          <EmptyState>
            Ask about today’s plan, how an exercise is trending, or say “I’m tired today” — the
            coach can see your training and nutrition history and act on it.
          </EmptyState>
        )}
        <div style={{ display: 'grid', gap: space.sm }}>
          {blocks.map((block) => (
            <ChatBlockView key={block.id} block={block} />
          ))}
          {live && (
            <>
              {live.toolCalls.map((call) => (
                <ToolChip
                  key={call.toolUseId}
                  label={
                    call.status === 'running'
                      ? describeToolStart(call.name, call.input)
                      : describeToolResult(call.name, call.status === 'ok')
                  }
                  ok={call.status !== 'error'}
                />
              ))}
              {live.text.length > 0 && <ChatBlockView block={{ kind: 'assistant', id: 'live', text: live.text }} />}
              {live.refusal && (
                <Card tone="raised">
                  <p style={{ margin: 0, color: themeColor.text }}>{live.refusal.message}</p>
                </Card>
              )}
              {live.error && (
                <Card tone="safety">
                  <p style={{ margin: 0, color: themeColor.text }}>{live.error.userMessage}</p>
                  {isAiError(live.error) &&
                    (live.error.kind === 'auth' || live.error.kind === 'permission' || live.error.kind === 'not_found') && (
                      <Link to="/you/settings" style={{ color: themeColor.accent, fontSize: fontSize.label }}>
                        Open Settings
                      </Link>
                    )}
                </Card>
              )}
              {busy && live.text.length === 0 && live.toolCalls.length === 0 && (
                <p style={{ color: themeColor.textMuted, fontSize: fontSize.label }}>Thinking…</p>
              )}
            </>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {chips.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: space.xs,
            flexWrap: 'wrap',
            padding: `0 ${space.md}px ${space.sm}px`,
          }}
        >
          {chips.map((chip) => (
            <MemoryChipView
              key={chip.id}
              chip={chip}
              onSave={() => void saveProposedMemory(chip as MemoryChip & { kind: 'proposed' })}
              onUndo={() => void undoRememberedMemory(chip as MemoryChip & { kind: 'remembered' })}
              onDismiss={() => dismissChip(chip.id)}
            />
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        style={{
          display: 'flex',
          gap: space.sm,
          padding: space.md,
          borderTop: `1px solid ${themeColor.border}`,
        }}
      >
        <textarea
          aria-label="Message the coach"
          value={draft}
          disabled={!canSend || busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={canSend ? 'Ask the coach…' : 'The coach needs a key and a connection'}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            padding: `${space.sm}px ${space.md}px`,
            borderRadius: radius.sm,
            border: `1px solid ${themeColor.border}`,
            background: themeColor.surfaceRaised,
            color: themeColor.text,
            fontSize: fontSize.body,
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={!canSend || busy || draft.trim().length === 0}
          style={{
            padding: `${space.sm}px ${space.lg}px`,
            borderRadius: radius.md,
            border: 'none',
            background: themeColor.accent,
            color: themeColor.textOnAccent,
            fontWeight: 600,
            cursor: 'pointer',
            opacity: !canSend || busy || draft.trim().length === 0 ? 0.5 : 1,
          }}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function StatusBanner({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      role="status"
      style={{
        padding: `${space.sm}px ${space.md}px`,
        background: themeColor.accentSoft,
        color: themeColor.text,
        fontSize: fontSize.label,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function ChatBlockView({ block }: { block: ChatBlock }): ReactNode {
  if (block.kind === 'user') {
    return (
      <div
        style={{
          justifySelf: 'end',
          maxWidth: '85%',
          background: themeColor.accent,
          color: themeColor.textOnAccent,
          borderRadius: radius.lg,
          padding: `${space.sm}px ${space.md}px`,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {block.text}
      </div>
    );
  }
  if (block.kind === 'assistant') {
    return (
      <div
        style={{
          maxWidth: '90%',
          background: themeColor.surfaceRaised,
          color: themeColor.text,
          borderRadius: radius.lg,
          padding: `${space.sm}px ${space.md}px`,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {block.text}
      </div>
    );
  }
  if (block.kind === 'proposedWorkout') {
    return (
      <Card tone="raised">
        <strong style={{ color: themeColor.text }}>Proposed: {block.title}</strong>
        <WhyDisclosure rationale={block.rationale} />
        <div style={{ marginTop: space.sm }}>
          <Link
            to={sessionPath(block.workoutId)}
            style={{
              display: 'inline-block',
              padding: `${space.xs}px ${space.md}px`,
              borderRadius: radius.md,
              background: themeColor.accent,
              color: themeColor.textOnAccent,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Start
          </Link>
        </div>
      </Card>
    );
  }
  return <ToolChip label={describeToolResult(block.name, block.ok)} ok={block.ok} />;
}

function ToolChip({ label, ok }: { label: string; ok: boolean }): ReactNode {
  return (
    <div
      style={{
        justifySelf: 'start',
        fontSize: fontSize.label,
        color: ok ? themeColor.textMuted : themeColor.bad,
        border: `1px solid ${ok ? themeColor.border : themeColor.bad}`,
        borderRadius: radius.pill,
        padding: `2px ${space.sm}px`,
      }}
    >
      {label}
    </div>
  );
}

function MemoryChipView({
  chip,
  onSave,
  onUndo,
  onDismiss,
}: {
  chip: MemoryChip;
  onSave: () => void;
  onUndo: () => void;
  onDismiss: () => void;
}): ReactNode {
  const label = chip.kind === 'remembered' ? `Remembered: ${chip.text}` : `Remember: ${chip.text}`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.xs,
        fontSize: fontSize.label,
        color: themeColor.text,
        border: `1px solid ${themeColor.borderStrong}`,
        borderRadius: radius.pill,
        padding: `${space.xs}px ${space.sm}px`,
      }}
    >
      <span>{label}</span>
      {chip.kind === 'remembered' ? (
        <button type="button" onClick={onUndo} style={chipButton}>
          Undo
        </button>
      ) : (
        <>
          <button type="button" onClick={onSave} style={chipButton}>
            Save
          </button>
          <button type="button" onClick={onDismiss} style={chipButton}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}

const smallButton = {
  padding: `${space.xs}px ${space.sm}px`,
  borderRadius: radius.sm,
  border: `1px solid ${themeColor.border}`,
  background: 'transparent',
  color: themeColor.text,
  fontSize: fontSize.label,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
} as const;

const chipButton = {
  background: 'none',
  border: 'none',
  color: themeColor.accent,
  cursor: 'pointer',
  fontSize: fontSize.caption,
  fontWeight: 600,
  padding: 0,
} as const;
