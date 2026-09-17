import { styles } from '../screen-styles/app/wallet/index';
import { Colors, Spacing } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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
  const screenActive = useScreenIsActive();
  const shown = visible && screenActive;
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const close = useCallback(() => {
    Keyboard.dismiss();
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!shown || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [shown, close]);
  useEffect(() => {
    if (!shown) return;
    // Also release a focused input on programmatic close or screen navigation.
    return () => Keyboard.dismiss();
  }, [shown]);

  // Do not leave an invisible native Modal controller intercepting iOS touches.
  // This screen-local overlay disappears in the same commit as the form.
  if (!shown) return null;

  return (
    <View style={styles.sheetHost} accessibilityViewIsModal onAccessibilityEscape={close}>
      <SafeAreaProvider>
        <WalletSheetModalBody
          icon={icon}
          onClose={close}
          subtitle={subtitle}
          title={title}
        >
          {children}
        </WalletSheetModalBody>
      </SafeAreaProvider>
    </View>
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
  const { height } = useWindowDimensions();
  const bottomInset = Math.max(insets.bottom, Spacing.lg) + Spacing.md;
  // Resolve the available space *inside* keyboard avoidance before sizing the
  // sheet. A percentage minHeight on the sheet can push it above the viewport.
  const content = (
    <View pointerEvents="box-none" style={[styles.sheetViewport, {
      paddingTop: insets.top + Spacing.sm, paddingLeft: insets.left, paddingRight: insets.right,
    }]}>
        <View style={[styles.sheetCard, { height: Math.round(height * 0.9) }]}>
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
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={[styles.sheetContent, { paddingBottom: bottomInset }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={false}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            bounces={false}
          >
            {children}
          </ScrollView>
        </View>
    </View>
  );

  return (
    <View style={styles.sheetOverlay}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}
        accessibilityRole="button" accessibilityLabel="Fermer le formulaire" />
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={styles.sheetKeyboard}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        // The Android activity uses adjustResize. Do not shrink the form twice.
        <View pointerEvents="box-none" style={styles.sheetKeyboard}>{content}</View>
      )}
    </View>
  );
}
