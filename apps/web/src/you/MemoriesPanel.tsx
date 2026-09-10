/**
 * You → Memories — DESIGN.md §8: "every memory row is visible, editable and
 * deletable"; §9 phase 2 brief item 4: grouped list, edit, delete, forget
 * with a reason, a search box, and a summary built from the same rows.
 */

import { radius, space } from '@vigor/ui-tokens';
import type { Memory, MemoryDomain, MemoryKind } from '@vigor/core';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Card, EmptyState, Pill } from '../components/ui';
import { useActiveMemories, useInvalidate, useRepos } from '../data/hooks';
import { humanize } from '../lib/display';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { summarizeMemories } from './memorySummary';

const KIND_ORDER: readonly MemoryKind[] = [
  'injury',
  'constraint',
  'dislike',
  'preference',
  'behavior',
  'goal_note',
  'fact',
];

const DOMAIN_ORDER: readonly MemoryDomain[] = ['training', 'nutrition', 'general'];

/**
 * What the user is most likely to be writing down, first. The coach can create
 * any of these too; this list is the same set, in the order a person reaches
 * for them.
 */
const ADDABLE_KINDS: readonly MemoryKind[] = [
  'preference',
  'dislike',
  'constraint',
  'injury',
  'goal_note',
  'fact',
  'behavior',
];

const KIND_PLACEHOLDER: Record<MemoryKind, string> = {
  preference: 'e.g. I train best early in the morning',
  dislike: 'e.g. I hate burpees',
  constraint: 'e.g. no dairy',
  injury: 'e.g. my left knee hates deep lunges',
  behavior: 'e.g. I always skip Friday sessions',
  goal_note: 'e.g. I want to deadlift 140 kg by spring',
  fact: 'e.g. I work night shifts every other week',
};

export function MemoriesPanel(): ReactNode {
  const { data: memories, isPending } = useActiveMemories();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const rows = memories ?? [];
    const needle = query.trim().toLowerCase();
    return needle.length === 0
      ? rows
      : rows.filter((row) => row.text.toLowerCase().includes(needle));
  }, [memories, query]);

  const groups = useMemo(() => groupMemories(filtered), [filtered]);

  return (
    <div>
      <Card style={{ marginBottom: space.lg }}>
        <p style={{ margin: 0, color: themeColor.text }}>{summarizeMemories(memories ?? [])}</p>
      </Card>

      <AddMemoryForm />

      <input
        type="search"
        aria-label="Search memories"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search memories…"
        style={{
          width: '100%',
          padding: `${space.sm}px ${space.md}px`,
          borderRadius: radius.sm,
          border: `1px solid ${themeColor.border}`,
          background: themeColor.surface,
          color: themeColor.text,
          fontSize: fontSize.body,
          marginBottom: space.lg,
        }}
      />

      {isPending && <p style={{ color: themeColor.textMuted }}>Reading your memories…</p>}

      {!isPending && filtered.length === 0 && (
        <EmptyState>
          {query.trim().length > 0
            ? 'No memory matches that search.'
            : 'Nothing remembered yet. The coach stores durable preferences, dislikes, constraints and injuries it learns in chat, and you can write your own in the form above.'}
        </EmptyState>
      )}

      {groups.map((group) => (
        <section key={group.kind} style={{ marginBottom: space.xl }}>
          <h2
            style={{
              fontSize: fontSize.subheading,
              color: themeColor.text,
              margin: `0 0 ${space.sm}px`,
            }}
          >
            {humanize(group.kind)}
          </h2>
          {group.domains.map((domainGroup) => (
            <div key={domainGroup.domain} style={{ marginBottom: space.md }}>
              <p
                style={{
                  fontSize: fontSize.label,
                  color: themeColor.textMuted,
                  margin: `0 0 ${space.xs}px`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {humanize(domainGroup.domain)}
              </p>
              <div style={{ display: 'grid', gap: space.sm }}>
                {domainGroup.memories.map((memory) => (
                  <MemoryRow key={memory.id} memory={memory} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Writing a memory by hand — DESIGN.md §8 and `idea.md` §2.
 *
 * Until now the only writer was the coach, so "no dairy" or "my knee hates
 * lunges" could not be recorded at all without an API key and a network. This
 * writes straight through `memories.create` with `source: 'user'`, which is
 * exactly the row `packages/core/planner` and `substitution` filter on, so it
 * takes effect offline and immediately.
 */
function AddMemoryForm(): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [kind, setKind] = useState<MemoryKind>('preference');
  const [domain, setDomain] = useState<MemoryDomain>('training');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const trimmed = text.trim();

  async function add(): Promise<void> {
    if (trimmed.length === 0) return;
    setBusy(true);
    setProblem(null);
    try {
      await repos.memories.create({
        kind,
        domain,
        text: trimmed,
        // The user said it themselves, so it is not a guess (DESIGN.md §4.1).
        source: 'user',
        confidence: 1,
      });
      await invalidate('remember');
      setText('');
      setSaved(trimmed);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginBottom: space.lg }}>
      <h2
        style={{
          fontSize: fontSize.subheading,
          color: themeColor.text,
          margin: `0 0 ${space.xs}px`,
        }}
      >
        Add a memory
      </h2>
      <p
        style={{
          margin: `0 0 ${space.sm}px`,
          color: themeColor.textMuted,
          fontSize: fontSize.label,
        }}
      >
        Anything durable the coach and the offline planner should work around — a preference, a
        dislike, a dietary restriction, a joint that complains. No network needed.
      </p>
      <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginBottom: space.sm }}>
        <label style={{ fontSize: fontSize.label, color: themeColor.textMuted }}>
          Kind
          <select
            aria-label="Memory kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as MemoryKind)}
            style={{ ...controlStyle, marginLeft: space.xs }}
          >
            {ADDABLE_KINDS.map((option) => (
              <option key={option} value={option}>
                {humanize(option)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: fontSize.label, color: themeColor.textMuted }}>
          Domain
          <select
            aria-label="Memory domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value as MemoryDomain)}
            style={{ ...controlStyle, marginLeft: space.xs }}
          >
            {DOMAIN_ORDER.map((option) => (
              <option key={option} value={option}>
                {humanize(option)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        aria-label="New memory text"
        value={text}
        rows={2}
        placeholder={KIND_PLACEHOLDER[kind]}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(null);
        }}
        style={{
          width: '100%',
          padding: space.sm,
          borderRadius: radius.sm,
          border: `1px solid ${themeColor.border}`,
          background: themeColor.surface,
          color: themeColor.text,
          fontSize: fontSize.body,
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: space.md, alignItems: 'center', marginTop: space.sm }}>
        <button
          type="button"
          disabled={busy || trimmed.length === 0}
          onClick={() => void add()}
          style={{
            ...linkButton,
            opacity: busy || trimmed.length === 0 ? 0.5 : 1,
            cursor: trimmed.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Remember this'}
        </button>
        {saved && (
          <span role="status" style={{ color: themeColor.good, fontSize: fontSize.label }}>
            Remembered: {saved}
          </span>
        )}
        {problem && (
          <span role="alert" style={{ color: themeColor.bad, fontSize: fontSize.label }}>
            {problem}
          </span>
        )}
      </div>
    </Card>
  );
}

const controlStyle = {
  padding: `${space.xs}px ${space.sm}px`,
  borderRadius: radius.sm,
  border: `1px solid ${themeColor.border}`,
  background: themeColor.surface,
  color: themeColor.text,
  fontSize: fontSize.label,
} as const;

interface DomainGroup {
  domain: MemoryDomain;
  memories: Memory[];
}
interface KindGroup {
  kind: MemoryKind;
  domains: DomainGroup[];
}

function groupMemories(memories: readonly Memory[]): KindGroup[] {
  const groups: KindGroup[] = [];
  for (const kind of KIND_ORDER) {
    const domains: DomainGroup[] = [];
    for (const domain of DOMAIN_ORDER) {
      const rows = memories.filter((memory) => memory.kind === kind && memory.domain === domain);
      if (rows.length > 0) domains.push({ domain, memories: rows });
    }
    if (domains.length > 0) groups.push({ kind, domains });
  }
  return groups;
}

function MemoryRow({ memory }: { memory: Memory }): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [mode, setMode] = useState<'view' | 'edit' | 'forget' | 'delete'>('view');
  const [text, setText] = useState(memory.text);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveEdit(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      await repos.memories.update(memory.id, { text: trimmed });
      await invalidate('remember');
      setMode('view');
    } finally {
      setBusy(false);
    }
  }

  async function confirmForget(): Promise<void> {
    setBusy(true);
    try {
      await repos.memories.forget(memory.id, reason.trim() || undefined);
      await invalidate('forget');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    setBusy(true);
    try {
      await repos.memories.remove(memory.id);
      await invalidate('forget');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="raised">
      {mode === 'edit' ? (
        <div>
          <textarea
            aria-label="Edit memory text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: space.sm,
              borderRadius: radius.sm,
              border: `1px solid ${themeColor.border}`,
              background: themeColor.surface,
              color: themeColor.text,
              fontSize: fontSize.body,
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: space.sm, marginTop: space.sm }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveEdit()}
              style={linkButton}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setText(memory.text);
                setMode('view');
              }}
              style={linkButton}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ margin: 0, color: themeColor.text }}>{memory.text}</p>
          <div
            style={{
              display: 'flex',
              gap: space.xs,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: space.sm,
            }}
          >
            <Pill>{memory.source}</Pill>
            <Pill>{Math.round(memory.confidence * 100)}% confidence</Pill>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setMode('edit')} style={linkButton}>
              Edit
            </button>
            <button type="button" onClick={() => setMode('forget')} style={linkButton}>
              Forget
            </button>
            <button
              type="button"
              onClick={() => setMode('delete')}
              style={{ ...linkButton, color: themeColor.bad }}
            >
              Delete
            </button>
          </div>
        </>
      )}

      {mode === 'forget' && (
        <div style={{ marginTop: space.sm, display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
          <input
            aria-label="Reason for forgetting"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional reason"
            style={{
              flex: 1,
              minWidth: 160,
              padding: `${space.xs}px ${space.sm}px`,
              borderRadius: radius.sm,
              border: `1px solid ${themeColor.border}`,
              background: themeColor.surface,
              color: themeColor.text,
              fontSize: fontSize.label,
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmForget()}
            style={linkButton}
          >
            Confirm forget
          </button>
          <button type="button" onClick={() => setMode('view')} style={linkButton}>
            Cancel
          </button>
        </div>
      )}

      {mode === 'delete' && (
        <div style={{ marginTop: space.sm, display: 'flex', gap: space.sm, alignItems: 'center' }}>
          <span style={{ color: themeColor.bad, fontSize: fontSize.label }}>
            Delete this permanently? This cannot be undone.
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmDelete()}
            style={{ ...linkButton, color: themeColor.bad }}
          >
            Yes, delete
          </button>
          <button type="button" onClick={() => setMode('view')} style={linkButton}>
            Cancel
          </button>
        </div>
      )}
    </Card>
  );
}

const linkButton = {
  background: 'none',
  border: 'none',
  color: themeColor.accent,
  cursor: 'pointer',
  fontSize: fontSize.label,
  fontWeight: 600,
  padding: 0,
} as const;
