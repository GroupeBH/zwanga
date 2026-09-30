import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '@/constants/styles';
import { applyOtpInput, otpDigits } from '@/features/auth/otpInput';

interface Props {
  code: string[];
  onChange: (code: string[]) => void;
  inputRefs: React.MutableRefObject<(TextInput | null)[]>;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  filledStyle?: StyleProp<TextStyle>;
}

export function OtpCodeInput({ code, onChange, inputRefs, disabled = false, compact = false, label, containerStyle, inputStyle, filledStyle }: Props) {
  const [pasting, setPasting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const reading = useRef(false);
  const revision = useRef(0);
  const latest = useRef({ code, onChange, disabled });
  if (latest.current.code !== code || latest.current.disabled !== disabled) revision.current++;
  latest.current = { code, onChange, disabled };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const commit = (next: string[]) => {
    revision.current++;
    // Consecutive native events must merge against this value, not an older React render.
    latest.current.code = next;
    setNotice(null);
    latest.current.onChange(next);
  };
  const change = (text: string, index: number) => {
    if (!mounted.current || latest.current.disabled) return;
    const next = applyOtpInput(latest.current.code, text, index);
    commit(next.code);
    if (next.focusNext) inputRefs.current[index + 1]?.focus();
  };
  const paste = async () => {
    if (!mounted.current || latest.current.disabled || reading.current) return;
    reading.current = true;
    setPasting(true);
    const startedAt = revision.current;
    const current = () => mounted.current && !latest.current.disabled && startedAt === revision.current;
    try {
      // Clipboard access is exclusively initiated by this explicit user action.
      const value = await Clipboard.getStringAsync();
      if (!current()) return;
      const digits = otpDigits(value);
      if (digits.length !== latest.current.code.length) {
        setNotice(`Copiez uniquement le code à ${latest.current.code.length} chiffres, puis réessayez.`);
        return;
      }
      commit(digits.split(''));
    } catch {
      if (current()) setNotice('Impossible de lire le presse-papiers. Collez le code dans une case ou saisissez-le.');
    } finally {
      reading.current = false;
      if (mounted.current) setPasting(false);
    }
  };

  const pasteAction = <TouchableOpacity style={styles.paste} onPress={() => void paste()} disabled={disabled || pasting}
    accessibilityRole="button" accessibilityState={{ disabled: disabled || pasting, busy: pasting }}>
    {pasting && <ActivityIndicator size="small" color={Colors.primary} />}
    <Text style={[styles.pasteText, disabled && styles.disabled]}>Coller le code</Text>
  </TouchableOpacity>;

  return <>
    {compact && <View style={styles.heading}>
      <Text style={styles.label}>{label ?? `Code à ${code.length} chiffres`}</Text>
      {pasteAction}
    </View>}
    <View style={containerStyle}>
      {code.map((digit, index) => <TextInput
        key={index}
        ref={ref => { inputRefs.current[index] = ref; }}
        style={[inputStyle, digit ? filledStyle : null]}
        value={digit}
        keyboardType="number-pad"
        // Let JS remove spaces/hyphens before limiting the number of OTP digits.
        maxLength={64}
        autoComplete={index === 0 ? (Platform.OS === 'android' ? 'sms-otp' : 'one-time-code') : 'off'}
        textContentType={index === 0 ? 'oneTimeCode' : 'none'}
        importantForAutofill={index === 0 ? 'yes' : 'no'}
        selectTextOnFocus
        contextMenuHidden={false}
        autoCorrect={false}
        spellCheck={false}
        editable={!disabled}
        accessibilityLabel={`Chiffre ${index + 1} sur ${code.length}`}
        onChangeText={text => change(text, index)}
        onKeyPress={event => {
          if (mounted.current && !latest.current.disabled && event.nativeEvent.key === 'Backspace' && !latest.current.code[index] && index > 0) inputRefs.current[index - 1]?.focus();
        }}
      />)}
    </View>
    {!compact && pasteAction}
    {notice && <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text>}
  </>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: Colors.gray[800] },
  paste: { minHeight: 44, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  pasteText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  notice: { color: Colors.gray[700], fontSize: 13, marginBottom: 8 },
});
