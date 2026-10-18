import React from 'react';
import { Platform, StyleSheet, type ViewProps } from 'react-native';
import { RideModal as Modal, type RideModalProps } from '@/features/navigation/RideModal';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

/** Measure this native window, not the screen behind a modal or another route. */
export function FormScreen({ children, style, ...props }: ViewProps) {
  return (
    <SafeAreaProvider style={styles.fill}>
      <SafeAreaView {...props} edges={['top', 'right', 'bottom', 'left']} style={[styles.fill, style]}>
        {/* Descendants receive the remaining insets, so nested SafeAreaViews do
            not add the navigation bar a second time. Keep providers outside
            animated cards, scroll views and keyboard-avoiding content. */}
        <SafeAreaProvider style={styles.fill}>{children}</SafeAreaProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export function FormModal({ children, ...props }: RideModalProps) {
  return (
    <Modal {...props}>
      {Platform.OS === 'android' ? <FormScreen>{children}</FormScreen> : children}
    </Modal>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
