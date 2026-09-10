/**
 * You → Memories — DESIGN.md §7.1, §8: "view/edit/delete/forget", "a search
 * box", and every row visible with source and confidence.
 */
import { useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import type { Memory } from '@vigor/core';

import {
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
import { Body, Caption, Card, EmptyState, SectionHeading } from '../../../src/ui/kit';
import { color, fontSize, radius, space } from '../../../src/ui/tokens';

function confidencePct(value: number): string {
  return `${Math.round(value * 100)}%`;
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
        Everything the coach has stored about you — visible, editable and deletable, DESIGN.md §8.
      </ScreenBlurb>

      <Card title="What the coach knows">
        <Body muted>{summary}</Body>
      </Card>

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
              : 'Tell the coach a preference, a dislike or a constraint and it will show up here.'
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
