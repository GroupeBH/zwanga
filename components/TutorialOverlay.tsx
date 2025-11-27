import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '@/constants/styles';

interface TutorialOverlayProps {
  visible: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
  primaryLabel?: string;
}

export function TutorialOverlay({
  visible,
  title,
  message,
  onDismiss,
  primaryLabel = 'Compris',
}: TutorialOverlayProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Guide</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonText}>{primaryLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  pill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
  },
  pillText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  button: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  buttonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
});


