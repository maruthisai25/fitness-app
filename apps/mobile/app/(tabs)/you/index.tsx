import { useRouter } from 'expo-router';

import { LinkRow, Screen, ScreenBlurb, ScreenTitle, Section } from '../../../src/ui/components';

export default function YouMenuScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenTitle>You</ScreenTitle>
      <ScreenBlurb>
        Profile, goals, equipment, targets, memories, notifications, API key and export.
      </ScreenBlurb>

      <Section title="Training profile">
        <LinkRow
          title="Profile"
          subtitle="Basics, units, food region"
          onPress={() => router.push('/you/profile')}
        />
        <LinkRow
          title="Goals"
          subtitle="What you're training for, in priority order"
          onPress={() => router.push('/you/goals')}
        />
        <LinkRow
          title="Equipment"
          subtitle="What you can train with"
          onPress={() => router.push('/you/equipment')}
        />
      </Section>

      <Section title="App">
        <LinkRow
          title="Settings"
          subtitle="API key, models, notifications, units"
          onPress={() => router.push('/you/settings')}
        />
        <LinkRow
          title="Export data"
          subtitle="Encrypted backup as a JSON file"
          onPress={() => router.push('/you/export')}
        />
        <LinkRow
          title="Import data"
          subtitle="Restore from a backup"
          onPress={() => router.push('/you/import')}
        />
      </Section>
    </Screen>
  );
}
