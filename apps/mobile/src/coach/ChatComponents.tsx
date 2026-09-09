/**
 * Small rendering pieces for the coach chat — DESIGN.md §7.1: streaming
 * assistant text, tool activity chips, and "Remembered: …" chips with undo.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, fontSize, fontWeight, radius, space } from '../ui/tokens';
import { toolActivityLabel } from './toolLabels';

export function ToolChip({ name, status }: { name: string; status: 'running' | 'ok' | 'error' }) {
  return (
    <View style={[styles.toolChip, status === 'error' && styles.toolChipError]}>
      <Text style={[styles.toolChipText, status === 'error' && styles.toolChipTextError]}>
        {toolActivityLabel(name, status)}
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
    <View style={[styles.bubble, role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
      {text.length > 0 ? (
        <Text style={[styles.bubbleText, role === 'user' && styles.bubbleTextUser]}>{text}</Text>
      ) : null}
      {children}
    </View>
  );
}

export function RememberedChip({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <View style={styles.remembered} testID="remembered-chip">
      <Text style={styles.rememberedText}>{`Remembered: ${text}`}</Text>
      <Pressable accessibilityRole="button" onPress={onUndo}>
        <Text style={styles.rememberedUndo}>Undo</Text>
      </Pressable>
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
  rememberedUndo: {
    color: color.accent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
  },
});
