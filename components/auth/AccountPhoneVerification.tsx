import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OtpCodeInput } from './OtpCodeInput';
import { useAccountPhoneOtp } from '@/hooks/auth/useAccountPhoneOtp';
import { DEFAULT_SUPPORT_EMAIL } from '@/components/support/supportData';
import { Colors } from '@/constants/styles';

export function AccountPhoneVerification({ phone, refreshProfile }: {
  phone: string; refreshProfile: () => Promise<unknown>;
}) {
  const flow = useAccountPhoneOtp(phone, refreshProfile);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const disabled = flow.busy || (!flow.sent && flow.cooldown > 0) ||
    (flow.sent && !flow.confirmed && !/^\d{5}$/.test(flow.code.join('')));
  return <View style={styles.form}>
    <Text style={styles.title} accessibilityRole="header">Confirmez votre numéro</Text>
    <Text style={styles.body}>Pour continuer dans Zwanga, vérifiez que ce numéro vous appartient. Cette vérification ne sera plus demandée pour ce numéro une fois validé.</Text>
    <Text style={styles.phone}>{phone}</Text>
    {flow.sent && !flow.confirmed && <>
      <Text style={styles.body}>Saisissez les 5 chiffres reçus par SMS. Ce code est différent de votre mot de passe.</Text>
      <OtpCodeInput code={flow.code} onChange={flow.setCode} inputRefs={inputRefs}
        disabled={flow.busy} compact containerStyle={styles.codeRow} inputStyle={styles.digit} filledStyle={styles.filled} />
    </>}
    {flow.confirmed && <Text style={styles.body}>Code validé. Nous confirmons votre compte avant de continuer.</Text>}
    {!!flow.error && <Text accessibilityRole="alert" style={styles.error}>{flow.error}</Text>}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled, busy: flow.busy }}
      disabled={disabled} style={[styles.primary, disabled && styles.disabled]}
      onPress={() => void (flow.confirmed ? flow.retryConfirmation() : flow.sent ? flow.verify() : flow.send())}>
      {flow.busy && <ActivityIndicator color={Colors.white} />}
      <Text style={styles.primaryText}>{flow.busy ? 'Un instant…' : flow.confirmed ? 'Réessayer la confirmation' : flow.sent ? 'Vérifier mon numéro' : flow.cooldown > 0 ? `Réessayer dans ${flow.cooldown} s` : 'Recevoir le code par SMS'}</Text>
    </TouchableOpacity>
    {flow.sent && !flow.confirmed && <TouchableOpacity accessibilityRole="button"
      disabled={flow.busy || flow.cooldown > 0} style={styles.secondary} onPress={() => void flow.send()}>
      <Text style={styles.link}>{flow.cooldown > 0 ? `Renvoyer dans ${flow.cooldown} s` : 'Renvoyer le code'}</Text>
    </TouchableOpacity>}
  </View>;
}

export function PhoneVerificationShell({ children, onLogout }: { children: React.ReactNode; onLogout: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [error, setError] = useState('');
  const logoutLock = useRef(false);
  const logout = async () => {
    if (logoutLock.current) return;
    logoutLock.current = true; setBusy(true); setError('');
    try { await onLogout(); }
    catch { setError('Déconnexion indisponible. Réessayez.'); }
    finally { logoutLock.current = false; setBusy(false); }
  };
  return <SafeAreaView style={styles.root}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Zwanga</Text>
        {children}
        <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => setHelp(value => !value)}>
          <Text style={styles.link}>Je n’ai plus accès à ce numéro</Text>
        </TouchableOpacity>
        {help && <View style={styles.help}>
          <Text style={styles.body}>Contactez l’assistance pour récupérer l’accès à votre compte. Ne partagez jamais votre code SMS ou votre mot de passe.</Text>
          <TouchableOpacity accessibilityRole="link" onPress={() => {
            void Linking.openURL(`mailto:${DEFAULT_SUPPORT_EMAIL}`).catch(() => setError(`Écrivez à ${DEFAULT_SUPPORT_EMAIL} depuis votre messagerie.`));
          }}><Text style={styles.link}>{DEFAULT_SUPPORT_EMAIL}</Text></TouchableOpacity>
        </View>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => void logout()}>
          <Text style={styles.link}>{busy ? 'Déconnexion…' : 'Se déconnecter'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export const accountPhoneStyles = StyleSheet.create({
  form: { gap: 18 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.gray[900] },
  body: { fontSize: 16, lineHeight: 24, color: Colors.gray[700] },
  primary: { minHeight: 52, padding: 16, borderRadius: 14, backgroundColor: '#C43F00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: Colors.white, fontWeight: '700', fontSize: 17, flexShrink: 1, textAlign: 'center' },
  error: { color: '#A32424', fontSize: 15, lineHeight: 22 },
});
const styles = StyleSheet.create({
  ...accountPhoneStyles,
  root: { flex: 1, backgroundColor: Colors.white },
  content: { flexGrow: 1, padding: 24, paddingBottom: 40, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  brand: { fontSize: 24, fontWeight: '800', color: Colors.gray[900], marginBottom: 24 },
  phone: { fontSize: 22, fontWeight: '700', color: Colors.gray[900] },
  codeRow: { flexDirection: 'row', gap: 8 },
  digit: { flex: 1, minWidth: 0, minHeight: 52, textAlign: 'center', fontSize: 24, color: Colors.gray[900], borderWidth: 1, borderColor: Colors.gray[400], borderRadius: 10 },
  filled: { borderColor: '#C43F00' },
  disabled: { opacity: 0.5 },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  link: { color: '#A73700', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  help: { gap: 12, padding: 16, backgroundColor: Colors.gray[50], borderRadius: 12 },
});
