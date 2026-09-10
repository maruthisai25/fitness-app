import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, fontSize, HIT_TARGET, space } from '../../src/ui/tokens';

import { useRepos } from '../../src/db/AppDataProvider';
import {
  Button,
  ChoiceRow,
  ErrorBanner,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
} from '../../src/ui/components';

const DURATION_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '20', label: '20 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
];

const STYLE_OPTIONS = [
  'Strength training',
  'Bodybuilding',
  'Calisthenics',
  'Circuit / conditioning',
  'Running',
  'Mobility / yoga',
] as const;

export default function OnboardingDurationScreen() {
  const router = useRouter();
  const { profile } = useRepos();
  const [durationMin, setDurationMin] = useState('45');
  const [styles, setStyles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void profile.get().then((current) => {
      if (!current) return;
      setDurationMin(String(current.preferredDurationMin));
      setStyles(current.preferredStyles);
    });
  }, [profile]);

  function toggleStyle(style: string) {
    setStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style],
    );
  }

  async function next() {
    setSaving(true);
    setError(null);
    try {
      await profile.update({
        preferredDurationMin: Number(durationMin),
        preferredStyles: styles,
      });
      router.push('/onboarding/apikey');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your preferences.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>How you like to train</ScreenTitle>
      <ScreenBlurb>
        This shapes how long sessions are and which templates the coach reaches for.
      </ScreenBlurb>

      <Section title="Preferred session length">
        <View style={{ padding: space.lg }}>
          <ChoiceRow value={durationMin} options={DURATION_OPTIONS} onChange={setDurationMin} />
        </View>
      </Section>

      <Section title="Preferred styles">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.lg }}>
          {STYLE_OPTIONS.map((style) => {
            const active = styles.includes(style);
            return (
              <Pressable
                key={style}
                onPress={() => toggleStyle(style)}
                accessibilityRole="checkbox"
                accessibilityLabel={style}
                accessibilityState={{ checked: active, disabled: false }}
                hitSlop={8}
                style={{
                  paddingVertical: space.sm,
                  paddingHorizontal: space.md,
                  minHeight: HIT_TARGET - 16,
                  justifyContent: 'center',
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? color.accent : color.borderStrong,
                  backgroundColor: active ? color.accentSoft : 'transparent',
                }}
              >
                <Text
                  maxFontSizeMultiplier={2}
                  style={{
                    color: active ? color.accent : color.textMuted,
                    fontSize: fontSize.label,
                  }}
                >
                  {style}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      {error ? <ErrorBanner message={error} /> : null}
      <Button label="Continue" onPress={next} loading={saving} />
    </Screen>
  );
}
