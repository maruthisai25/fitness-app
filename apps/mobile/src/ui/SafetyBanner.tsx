/**
 * The safety banner — DESIGN.md §6.5: "the UI shows a banner until the user
 * resolves the event". It is persistent: any unresolved `safety_events` row
 * keeps it on screen, on Today, on Train and inside session mode.
 *
 * While it shows, the engines hold: the planner drops load and a set
 * (DESIGN.md §5.1 rule 1) and session mode says so above the first set.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useOpenSafetyEvents, useResolveSafetyEvent } from '../data/queries';
import { color, fontSize, fontWeight, radius, space } from './tokens';

const KIND_LABEL: Record<string, string> = {
  pain: 'Pain',
  injury: 'Injury',
  dizziness: 'Dizziness',
  symptom: 'Symptom',
  excessive_fatigue: 'Unusual fatigue',
};

export function SafetyBanner({ compact = false }: { compact?: boolean }) {
  const { data: events } = useOpenSafetyEvents();
  const resolve = useResolveSafetyEvent();

  if (!events || events.length === 0) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.title}>
        {events.length === 1 ? 'Safety event open' : `${events.length} safety events open`}
      </Text>
      <Text style={styles.blurb}>
        Loads hold where they are and one set comes off until you close this. VigorEngine is not
        medical advice — see a professional if this is not settling.
      </Text>
      {compact
        ? null
        : events.map((event) => (
            <View key={event.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {`${KIND_LABEL[event.kind] ?? event.kind} · ${event.date}`}
                </Text>
                <Text style={styles.rowBody}>{event.text}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => resolve.mutate({ id: event.id, note: 'Resolved from the banner' })}
                disabled={resolve.isPending}
              >
                <Text style={styles.resolve}>Resolve</Text>
              </Pressable>
            </View>
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: color.safety,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.bad,
    padding: space.lg,
    marginTop: space.lg,
  },
  title: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  blurb: {
    color: color.text,
    fontSize: fontSize.label,
    lineHeight: fontSize.label * 1.45,
    marginTop: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.bad,
    paddingTop: space.md,
  },
  rowText: { flex: 1, marginRight: space.md },
  rowTitle: {
    color: color.text,
    fontSize: fontSize.label,
    fontWeight: fontWeight.medium,
  },
  rowBody: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  resolve: {
    color: color.accent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
  },
});
