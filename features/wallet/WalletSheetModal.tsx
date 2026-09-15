import { styles } from '../screen-styles/app/wallet/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { KeyboardAvoidingView, Platform, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

export function WalletSheetModal({
  visible,
  title,
  subtitle,
  icon,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="slide"
      presentationStyle="overFullScreen"
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <WalletSheetModalBody
          icon={icon}
          onClose={onClose}
          subtitle={subtitle}
          title={title}
        >
          {children}
        </WalletSheetModalBody>
      </SafeAreaProvider>
    </Modal>
  );
}

export function WalletSheetModalBody({
  title,
  subtitle,
  icon,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Spacing.lg) + Spacing.md;

  return (
    <View style={styles.sheetOverlay}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
        style={styles.sheetKeyboard}
      >
        <View style={[styles.sheetCard, { paddingBottom: bottomInset }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetBadge}>
              <Ionicons name={icon} size={22} color={Colors.white} />
            </View>
            <View style={styles.sheetHeaderCopy}>
              <Text numberOfLines={1} style={styles.sheetTitle}>
                {title}
              </Text>
              <Text numberOfLines={2} style={styles.sheetSubtitle}>
                {subtitle}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.sheetCloseButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={22} color={Colors.gray[500]} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetContent}>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
