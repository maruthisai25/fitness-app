/**
 * Small rendering pieces for the coach chat — DESIGN.md §7.1: streaming
 * assistant text, tool activity chips, and "Remembered: …" chips with undo.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextAction } from '../ui/components';
import { color, fontSize, radius, space } from '../ui/tokens';
import { toolActivityLabel } from './toolLabels';

export function ToolChip({ name, status }: { name: string; status: 'running' | 'ok' | 'error' }) {
  const label = toolActivityLabel(name, status);
  return (
    <View
      accessible
      // A chip that appears mid-turn is news; "polite" lets the reader finish
      // the sentence it is on before saying what the coach just did.
      accessibilityLiveRegion={status === 'running' ? 'polite' : 'none'}
      accessibilityLabel={label}
      style={[styles.toolChip, status === 'error' && styles.toolChipError]}
    >
      <Text style={[styles.toolChipText, status === 'error' && styles.toolChipTextError]}>
        {label}
      </Text>
    </View>
  );
}

export function MessageBubble({
  role,
  text,
  children,
}: {
  role: 'user' | 'assistant';
  text: string;
  children?: ReactNode;
}) {
  return (
    <View
      // Who said it has to be spoken; the colour and the side of the screen
      // that carry it visually mean nothing to a screen reader.
      accessibilityLabel={text.length > 0 ? `${role === 'user' ? 'You' : 'Coach'}: ${text}` : undefined}
      style={[styles.bubble, role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}
    >
      {text.length > 0 ? (
        <Text style={[styles.bubbleText, role === 'user' && styles.bubbleTextUser]}>{text}</Text>
      ) : null}
      {children}
    </View>
  );
}

export function RememberedChip({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <View
      style={styles.remembered}
      testID="remembered-chip"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Remembered: ${text}`}
    >
      <Text style={styles.rememberedText}>{`Remembered: ${text}`}</Text>
      <TextAction
        label="Undo"
        hint={`Forgets "${text}" again`}
        testID="remembered-chip-undo"
        onPress={onUndo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.sm,
    maxWidth: '90%',
  },
  bubbleUser: {
    backgroundColor: color.accentSoft,
    alignSelf: 'flex-end',
  },
  bubbleAssistant: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignSelf: 'flex-start',
  },
  bubbleText: {
    color: color.text,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.4,
  },
  bubbleTextUser: { color: color.text },
  toolChip: {
    alignSelf: 'flex-start',
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm + 2,
    marginTop: space.xs,
  },
  toolChipError: { borderColor: color.bad },
  toolChipText: {
    color: color.textMuted,
    fontSize: fontSize.caption,
  },
  toolChipTextError: { color: color.bad },
  remembered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.accentSoft,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginTop: space.sm,
  },
  rememberedText: {
    color: color.text,
    fontSize: fontSize.label,
    flex: 1,
    marginRight: space.sm,
  },
});
