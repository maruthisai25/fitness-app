/**
 * The `todayInsights` coach slot — "the coach's phrasing of the week"
 * (`apps/web/src/coach/slots.tsx`). Detectors are deterministic (DESIGN.md
 * §5.8); this only asks the coach to phrase the already-computed findings
 * into readable prose, on demand, so it costs nothing when nobody asks.
 */

import { phraseInsights, toAiError } from '@vigor/ai';
import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { useOpenInsights } from '../data/hooks';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useCoach } from './CoachProvider';

export function TodayInsightsSlot(): ReactNode {
  const { data: insights } = useOpenInsights();
  const { client, hasKey, online } = useCoach();
  const [phrased, setPhrased] = useState<{ id: string; headline: string; detail: string }[] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!insights || insights.length === 0 || !hasKey || !online || client == null) return null;
  // Narrowed above, but a closure declared after a guard does not keep that
  // narrowing in TypeScript's control-flow analysis — rebind so `run` sees
  // the non-null, defined types directly.
  const activeClient = client;
  const openInsights = insights;

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await phraseInsights({ client: activeClient, insights: openInsights });
      if (result.refusal) setError(result.refusal.message);
      else setPhrased(result.insights);
    } catch (cause) {
      setError(toAiError(cause).userMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: space.md, borderTop: `1px solid ${themeColor.border}`, paddingTop: space.md }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        style={{
          padding: `${space.xs}px ${space.md}px`,
          borderRadius: radius.md,
          border: `1px solid ${themeColor.borderStrong}`,
          background: 'transparent',
          color: themeColor.text,
          fontSize: fontSize.label,
          cursor: 'pointer',
        }}
      >
        {busy ? 'Asking the coach…' : 'Phrase these with the coach'}
      </button>
      {error && <p style={{ color: themeColor.bad, fontSize: fontSize.label }}>{error}</p>}
      {phrased && (
        <ul style={{ listStyle: 'none', margin: `${space.sm}px 0 0`, padding: 0 }}>
          {phrased.map((entry) => (
            <li key={entry.id} style={{ marginTop: space.sm }}>
              <strong style={{ color: themeColor.text }}>{entry.headline}</strong>
              <p style={{ margin: `2px 0 0`, color: themeColor.textMuted }}>{entry.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
