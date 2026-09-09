/**
 * One fixed-prompt ask, inline in a card — the shared shape behind "Ask the
 * coach for today's workout", the "Make it shorter" / "I'm tired today" quick
 * actions (DESIGN.md §9 phase 2/3), and the session-mode coach slot. Each
 * instance owns its own turn, so two of these on the same screen never
 * collide.
 */

import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useCoach } from './CoachProvider';
import { describeToolResult, describeToolStart } from './toolPresentation';
import { useCoachTurn } from './useCoachTurn';

export function InlineCoachAsk({
  label,
  prompt,
  busyLabel,
}: {
  label: string;
  /** The fixed message sent verbatim — DESIGN.md §7.1's quick actions. */
  prompt: string;
  busyLabel?: string;
}): ReactNode {
  const { ready, hasKey, online, ensureConversation } = useCoach();
  const { live, busy, send } = useCoachTurn();

  async function ask(): Promise<void> {
    const conversationId = await ensureConversation();
    await send(conversationId, prompt);
  }

  if (!ready) return null;
  const disabled = busy || !hasKey || !online;

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void ask()}
        style={{
          padding: `${space.xs}px ${space.md}px`,
          borderRadius: radius.md,
          border: `1px solid ${themeColor.borderStrong}`,
          background: 'transparent',
          color: themeColor.text,
          fontSize: fontSize.label,
          fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {busy ? (busyLabel ?? 'Asking the coach…') : label}
      </button>
      {!hasKey && (
        <p style={hintStyle}>Add an API key in You → Settings to use the coach here.</p>
      )}
      {hasKey && !online && <p style={hintStyle}>The coach needs a connection.</p>}

      {live && (
        <div style={{ marginTop: space.sm, display: 'grid', gap: space.xs }}>
          {live.toolCalls.map((call) => (
            <div key={call.toolUseId} style={chipStyle}>
              {call.status === 'running'
                ? describeToolStart(call.name, call.input)
                : describeToolResult(call.name, call.status === 'ok')}
            </div>
          ))}
          {live.text.length > 0 && (
            <p style={{ margin: 0, color: themeColor.text, whiteSpace: 'pre-wrap' }}>{live.text}</p>
          )}
          {live.refusal && <p style={{ margin: 0, color: themeColor.text }}>{live.refusal.message}</p>}
          {live.error && <p style={{ margin: 0, color: themeColor.bad }}>{live.error.userMessage}</p>}
        </div>
      )}
    </div>
  );
}

const hintStyle = {
  margin: `${space.xs}px 0 0`,
  color: themeColor.textFaint,
  fontSize: fontSize.caption,
} as const;

const chipStyle = {
  alignSelf: 'start',
  fontSize: fontSize.caption,
  color: themeColor.textMuted,
  border: `1px solid ${themeColor.border}`,
  borderRadius: radius.pill,
  padding: `2px ${space.sm}px`,
} as const;
