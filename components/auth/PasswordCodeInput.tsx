import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { authCodeStyles as codeStyles } from '@/features/auth/authCode.styles';

/** Passwords use one visible native field; digit boxes are reserved for SMS codes. */
export function PasswordCodeInput({ value, inputRef, onChange, label, disabled = false,
  compact = false, newPassword = false, error }: {
  value: string; inputRef: RefObject<TextInput | null>; onChange: (value: string) => void;
  label: string; disabled?: boolean; compact?: boolean; newPassword?: boolean; error?: string | null;
}) {
  const active = useScreenIsActive();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
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
  useEffect(() => {
    if (!active || disabled || !value) setRevealed(false);
  }, [active, disabled, value]);

  const editable = active && !disabled;
  const visible = revealed && editable;
  return <View style={[codeStyles.passwordField, compact && codeStyles.passwordFieldCompact,
    focused && codeStyles.passwordFieldFocused, !!error && codeStyles.passwordFieldError]}>
    <Ionicons name="lock-closed-outline" size={20} color={Colors.gray[600]} accessible={false} />
    <TextInput ref={inputRef} style={codeStyles.passwordInput}
      onPressIn={focus} keyboardType="number-pad" maxLength={4} secureTextEntry={!visible}
      placeholder="4 chiffres" placeholderTextColor={Colors.gray[500]}
      value={value} onChangeText={text => { if (live.current.mounted && live.current.active && !live.current.disabled) onChange(text.replace(/\D/g, '').slice(0, 4)); }}
      textContentType={newPassword ? 'newPassword' : 'password'} autoComplete="off" importantForAutofill="no" autoCorrect={false} spellCheck={false}
      accessibilityLabel={label} accessibilityHint="Votre mot de passe personnel à quatre chiffres, pas le code reçu par SMS."
      showSoftInputOnFocus editable={editable}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
    <TouchableOpacity style={codeStyles.passwordVisibility} disabled={!editable}
      accessibilityRole="button" accessibilityLabel={`${visible ? 'Masquer' : 'Afficher'} : ${label}`}
      accessibilityState={{ disabled: !editable }}
      onPress={() => { if (live.current.mounted && live.current.active && !live.current.disabled) setRevealed(previous => !previous); }}>
      <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={Colors.gray[700]} accessible={false} />
    </TouchableOpacity>
  </View>;
}
