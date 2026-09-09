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

export function MemoriesPanel(): ReactNode {
  const { data: memories, isPending } = useActiveMemories();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const rows = memories ?? [];
    const needle = query.trim().toLowerCase();
    return needle.length === 0 ? rows : rows.filter((row) => row.text.toLowerCase().includes(needle));
  }, [memories, query]);

  const groups = useMemo(() => groupMemories(filtered), [filtered]);

  return (
    <div>
      <Card style={{ marginBottom: space.lg }}>
        <p style={{ margin: 0, color: themeColor.text }}>
          {summarizeMemories(memories ?? [])}
        </p>
      </Card>

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
            : 'Nothing remembered yet. The coach stores durable preferences, dislikes, constraints and injuries it learns in chat, and you can add your own here later.'}
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
            <button type="button" disabled={busy} onClick={() => void saveEdit()} style={linkButton}>
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
            <button type="button" onClick={() => setMode('delete')} style={{ ...linkButton, color: themeColor.bad }}>
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
          <button type="button" disabled={busy} onClick={() => void confirmForget()} style={linkButton}>
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
