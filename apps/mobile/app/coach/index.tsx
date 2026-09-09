import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useCreateConversation, useConversationsQuery } from '../../src/coach/useCoach';
import { Button, Screen, ScreenBlurb, ScreenTitle } from '../../src/ui/components';
import { Body, Caption, EmptyState, ListRow } from '../../src/ui/kit';
import { space } from '../../src/ui/tokens';

/** The conversation list — DESIGN.md §7.1 "conversation list". */
export default function CoachListScreen() {
  const router = useRouter();
  const conversations = useConversationsQuery();
  const create = useCreateConversation();

  async function startNew() {
    const conversation = await create.mutateAsync(undefined);
    router.push(`/coach/${conversation.id}`);
  }

  const rows = conversations.data ?? [];

  return (
    <Screen>
      <ScreenTitle>Coach</ScreenTitle>
      <ScreenBlurb>
        Training, nutrition, today's plan — ask anything and it can act on it.
      </ScreenBlurb>
      <Button label="New conversation" onPress={() => void startNew()} loading={create.isPending} />

      {conversations.isLoading ? (
        <Caption>Loading conversations…</Caption>
      ) : rows.length === 0 ? (
        <EmptyState title="No conversations yet" blurb="Start one above." />
      ) : (
        <View style={{ marginTop: space.lg }}>
          {rows.map((conversation, index) => (
            <ListRow
              key={conversation.id}
              title={conversation.title}
              subtitle={new Date(conversation.lastMessageAt).toLocaleString()}
              onPress={() => router.push(`/coach/${conversation.id}`)}
              last={index === rows.length - 1}
            />
          ))}
        </View>
      )}

      {conversations.isError ? (
        <Body muted>Could not load your conversations.</Body>
      ) : null}
    </Screen>
  );
}
