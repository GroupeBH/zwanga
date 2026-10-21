import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { authStyles as styles } from './styles';
import { authCodeStyles as codeStyles } from '@/features/auth/authCode.styles';

/** One secure native field, four touchable visual slots; no secret in accessibility text. */
export function PasswordCodeInput({ value, inputRef, onChange, label, disabled = false,
  compact = false, login = false, error }: {
  value: string; inputRef: RefObject<TextInput | null>; onChange: (value: string) => void;
  label: string; disabled?: boolean; compact?: boolean; login?: boolean; error?: string | null;
}) {
  const active = useScreenIsActive();
  const [focused, setFocused] = useState(false);
  const frame = useRef<number | null>(null);
  const live = useRef({ active, disabled, mounted: true });
  live.current.active = active; live.current.disabled = disabled;
  const cancelFocus = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  useEffect(() => {
    const lifecycle = live.current;
    lifecycle.mounted = true;
    return () => { lifecycle.mounted = false; cancelFocus(); };
  }, [cancelFocus]);
  const focus = useCallback(() => {
    if (!live.current.mounted || !live.current.active || live.current.disabled) return;
    cancelFocus();
    const input = inputRef.current;
    if (!input) return;
    // Android can retain native focus when the keyboard was closed. Calling
    // focus() again is then a no-op: release focus before requesting it anew.
    if (Platform.OS === 'android' && input.isFocused() && !Keyboard.isVisible()) {
      input.blur();
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (live.current.mounted && live.current.active && !live.current.disabled && inputRef.current === input) input.focus();
      });
    } else input.focus();
  }, [cancelFocus, inputRef]);
  useEffect(() => {
    if (disabled || !active) { cancelFocus(); inputRef.current?.blur(); }
    // Restore only after React has made the input editable, without a modal above it.
    else if (error) focus();
  }, [active, disabled, error, focus, cancelFocus, inputRef]);

  return <TouchableOpacity activeOpacity={0.8} style={styles.pinEntryContainer}
    onPress={focus} disabled={disabled || !active} accessibilityRole="button"
    accessibilityLabel={label} accessibilityHint="Touchez pour ouvrir le clavier numérique"
    accessibilityState={{ disabled: disabled || !active }}
    accessibilityValue={{ text: `${value.length} chiffres saisis sur 4` }}>
    <TextInput ref={inputRef} style={[styles.pinHiddenInput, codeStyles.nativePasswordInput]}
      pointerEvents="none" keyboardType="number-pad" maxLength={4} secureTextEntry
      value={value} onChangeText={text => { if (live.current.mounted && live.current.active && !live.current.disabled) onChange(text.replace(/\D/g, '').slice(0, 4)); }}
      textContentType="password" autoComplete="off" autoCorrect={false} spellCheck={false}
      showSoftInputOnFocus editable={!disabled && active} accessible={false} importantForAccessibility="no"
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
    <View style={[styles.pinCodeContainer, compact && styles.pinCodeContainerCompact, login && codeStyles.pinRow]}
      pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3].map(slot => <View key={slot} style={[styles.pinInput,
        compact && styles.pinInputCompact, login && codeStyles.pinBox,
        value[slot] ? styles.pinInputFilled : null,
        focused && slot === Math.min(value.length, 3) && codeStyles.passwordBoxFocused,
        error && codeStyles.passwordBoxError]}>
        <Text style={[styles.pinDot, compact && styles.pinDotCompact, value[slot] ? styles.pinDotFilled : styles.pinDotEmpty]}>•</Text>
      </View>)}
    </View>
  </TouchableOpacity>;
}
