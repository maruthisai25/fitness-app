/**
 * You → Memories — DESIGN.md §7.1, §8: "view/edit/delete/forget", "a search
 * box", and every row visible with source and confidence.
 */
import { useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import type { Memory, MemoryDomain, MemoryKind } from '@vigor/core';

import {
  useCreateMemory,
  useForgetMemory,
  useMemoriesQuery,
  useRemoveMemory,
  useRestoreMemory,
  useUpdateMemoryText,
} from '../../../src/memories/useMemories';
import {
  filterMemories,
  groupMemories,
  memoryDomainLabel,
  memoryKindLabel,
  summarizeMemories,
} from '../../../src/memories/memoriesData';
import {
  Button,
  ErrorBanner,
  FieldHint,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextAction,
  TextField,
} from '../../../src/ui/components';
import { Body, Caption, Card, Chip, ChipRow, EmptyState, SectionHeading } from '../../../src/ui/kit';
import { color, fontSize, radius, space } from '../../../src/ui/tokens';

function confidencePct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** The kinds a person reaches for, in that order — the coach can write any of them too. */
const ADDABLE_KINDS: readonly MemoryKind[] = [
  'preference',
  'dislike',
  'constraint',
  'injury',
  'goal_note',
  'fact',
  'behavior',
];

const ADDABLE_DOMAINS: readonly MemoryDomain[] = ['training', 'nutrition', 'general'];

const KIND_PLACEHOLDER: Record<MemoryKind, string> = {
  preference: 'I train best early in the morning',
  dislike: 'I hate burpees',
  constraint: 'No dairy',
  injury: 'My left knee hates deep lunges',
  behavior: 'I always skip Friday sessions',
  goal_note: 'I want to deadlift 140 kg by spring',
  fact: 'I work night shifts every other week',
};

/**
 * Writing a memory by hand — DESIGN.md §8, `idea.md` §2.
 *
 * The coach was the only author until now, so a dietary restriction or a sore
 * joint could not be recorded at all without an API key and a network. This
 * writes through the repository, which is what `packages/core/planner` and
 * `substitution` read, so it takes effect offline and straight away.
 */
function AddMemoryCard() {
  const create = useCreateMemory();
  const [kind, setKind] = useState<MemoryKind>('preference');
  const [domain, setDomain] = useState<MemoryDomain>('training');
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  async function add() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    await create.mutateAsync({ kind, domain, text: trimmed });
    setText('');
    setSaved(trimmed);
  }

  return (
    <Card title="Add a memory">
      <Caption>
        Anything durable the coach and the offline planner should work around — a preference, a
        dislike, a dietary restriction, a joint that complains.
      </Caption>
      <ChipRow>
        {ADDABLE_KINDS.map((option) => (
          <Chip
            key={option}
            label={memoryKindLabel(option)}
            selected={kind === option}
            onPress={() => setKind(option)}
          />
        ))}
      </ChipRow>
      <ChipRow>
        {ADDABLE_DOMAINS.map((option) => (
          <Chip
            key={option}
            label={memoryDomainLabel(option)}
            selected={domain === option}
            onPress={() => setDomain(option)}
          />
        ))}
      </ChipRow>
      <View style={{ marginTop: space.sm }}>
        <TextField
          label="What should it remember?"
          testID="add-memory-text"
          placeholder={KIND_PLACEHOLDER[kind]}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setSaved(null);
          }}
          multiline
        />
        <Button
          label="Remember this"
          testID="add-memory-save"
          onPress={() => void add()}
          loading={create.isPending}
          disabled={text.trim().length === 0}
        />
        {saved ? <FieldHint>{`Remembered: ${saved}`}</FieldHint> : null}
        {create.isError ? <ErrorBanner message="That memory could not be saved." /> : null}
      </View>
    </Card>
  );
}

function MemoryRow({ memory }: { memory: Memory }) {
  const update = useUpdateMemoryText();
  const forget = useForgetMemory();
  const restore = useRestoreMemory();
  const remove = useRemoveMemory();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.text);
  const [reasonPrompt, setReasonPrompt] = useState(false);
  const [reason, setReason] = useState('');

  async function saveEdit() {
    const text = draft.trim();
    if (text.length === 0) return;
    await update.mutateAsync({ id: memory.id, text });
    setEditing(false);
  }

  async function confirmForget() {
    await forget.mutateAsync({ id: memory.id, reason: reason.trim().length > 0 ? reason.trim() : undefined });
    setReasonPrompt(false);
    setReason('');
  }

  function confirmDelete() {
    Alert.alert('Delete this memory?', 'This removes it for good — forget keeps it in the audit list instead.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove.mutate(memory.id) },
    ]);
  }

  return (
    <View
      style={{
        paddingVertical: space.md,
        borderBottomWidth: 1,
        borderBottomColor: color.border,
        opacity: memory.active ? 1 : 0.55,
      }}
      testID={`memory-${memory.id}`}
    >
      {editing ? (
        <View>
          <TextInput
            testID={`memory-${memory.id}-input`}
            accessibilityLabel="Memory text"
            accessibilityHint="Edit what the coach remembers, then save"
            style={{
              backgroundColor: color.surfaceRaised,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: color.border,
              padding: space.md,
              color: color.text,
              fontSize: fontSize.body,
            }}
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Save" onPress={() => void saveEdit()} loading={update.isPending} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setDraft(memory.text);
                  setEditing(false);
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <>
          <Body>{memory.text}</Body>
          <Caption>
            {`${memory.active ? 'active' : 'forgotten'} · source ${memory.source} · confidence ${confidencePct(memory.confidence)}`}
          </Caption>

          {reasonPrompt ? (
            <View style={{ marginTop: space.sm }}>
              <TextField
                label="Why forget it? (optional)"
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. that changed"
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Forget"
                    variant="danger"
                    testID={`memory-${memory.id}-forget-confirm`}
                    onPress={() => void confirmForget()}
                    loading={forget.isPending}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="secondary" onPress={() => setReasonPrompt(false)} />
                </View>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.sm }}>
              {memory.active ? (
                <>
                  <TextAction
                    label="Edit"
                    hint={`Rewrites "${memory.text}"`}
                    testID={`memory-${memory.id}-edit`}
                    onPress={() => setEditing(true)}
                  />
                  <TextAction
                    label="Forget"
                    tone="warn"
                    hint="Stops the coach using this, but keeps it in the audit list"
                    testID={`memory-${memory.id}-forget`}
                    onPress={() => setReasonPrompt(true)}
                  />
                </>
              ) : (
                <TextAction
                  label="Restore"
                  hint="Brings this back into the coach's context"
                  testID={`memory-${memory.id}-restore`}
                  busy={restore.isPending}
                  onPress={() => void restore.mutate(memory.id)}
                />
              )}
              <TextAction
                label="Delete"
                tone="bad"
                hint="Removes it for good"
                testID={`memory-${memory.id}-delete`}
                onPress={confirmDelete}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

export default function MemoriesScreen() {
  const memoriesQuery = useMemoriesQuery();
  const [query, setQuery] = useState('');

  const all = memoriesQuery.data ?? [];
  const active = useMemo(() => all.filter((memory) => memory.active), [all]);
  const forgotten = useMemo(() => all.filter((memory) => !memory.active), [all]);
  const summary = useMemo(() => summarizeMemories(all), [all]);

  const filteredActive = useMemo(() => filterMemories(active, query), [active, query]);
  const filteredForgotten = useMemo(() => filterMemories(forgotten, query), [forgotten, query]);
  const groupsActive = useMemo(() => groupMemories(filteredActive), [filteredActive]);
  const groupsForgotten = useMemo(() => groupMemories(filteredForgotten), [filteredForgotten]);

  if (memoriesQuery.isLoading) return <LoadingScreen label="Loading memories…" />;

  return (
    <Screen>
      <ScreenTitle>Memories</ScreenTitle>
      <ScreenBlurb>
        Everything VigorEngine holds about you — what you write here and what the coach picks up in
        chat — all visible, editable and deletable, DESIGN.md §8.
      </ScreenBlurb>

      <Card title="What the coach knows">
        <Body muted>{summary}</Body>
      </Card>

      <AddMemoryCard />

      <View style={{ marginTop: space.lg }}>
        <TextField
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search your memories"
        />
      </View>

      {memoriesQuery.isError ? <ErrorBanner message="Could not load your memories." /> : null}

      {groupsActive.length === 0 ? (
        <EmptyState
          title={query.length > 0 ? 'No matches' : 'Nothing remembered yet'}
          blurb={
            query.length > 0
              ? 'Try a different search.'
              : 'Write one in above, or tell the coach a preference, a dislike or a constraint in chat.'
          }
        />
      ) : (
        groupsActive.map((group) => (
          <View key={`${group.kind}:${group.domain}`}>
            <SectionHeading>{`${memoryKindLabel(group.kind)} · ${memoryDomainLabel(group.domain)}`}</SectionHeading>
            <Section>
              {group.memories.map((memory) => (
                <MemoryRow key={memory.id} memory={memory} />
              ))}
            </Section>
          </View>
        ))
      )}

      {groupsForgotten.length > 0 ? (
        <View>
          <SectionHeading>Forgotten</SectionHeading>
          <FieldHint>Kept for the audit trail. Restore brings one back into the coach's context.</FieldHint>
          {groupsForgotten.map((group) => (
            <View key={`forgotten:${group.kind}:${group.domain}`}>
              <Section title={`${memoryKindLabel(group.kind)} · ${memoryDomainLabel(group.domain)}`}>
                {group.memories.map((memory) => (
                  <MemoryRow key={memory.id} memory={memory} />
                ))}
              </Section>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
