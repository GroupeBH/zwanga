import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
    <View style={styles.heading}>
      <Text style={styles.title} accessibilityRole="header">{flow.confirmed ? 'Code validé' : flow.sent ? 'Entrez le code SMS' : 'Vérifiez votre numéro'}</Text>
      <Text style={styles.body}>{flow.confirmed ? 'Nous confirmons votre compte avant de continuer.' : flow.sent ?
        'Saisissez les 5 chiffres envoyés à ce numéro.' : 'Pour protéger votre compte, confirmez votre numéro avec un code SMS.'}</Text>
    </View>
    <View style={styles.phoneRow}>
      <Ionicons name="phone-portrait-outline" size={20} color={Colors.gray[600]} accessible={false} />
      <Text style={styles.phone} selectable>{phone}</Text>
    </View>
    {flow.sent && !flow.confirmed && <>
      <OtpCodeInput code={flow.code} onChange={flow.setCode} inputRefs={inputRefs}
        disabled={flow.busy} compact containerStyle={styles.codeRow} inputStyle={styles.digit} filledStyle={styles.filled} />
      <Text style={styles.hint}>Ce n’est pas votre mot de passe.</Text>
    </>}
    {!!flow.error && <Text accessibilityRole="alert" style={styles.error}>{flow.error}</Text>}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled, busy: flow.busy }}
      disabled={disabled} style={[styles.primary, disabled && styles.disabled]}
      onPress={() => void (flow.confirmed ? flow.retryConfirmation() : flow.sent ? flow.verify() : flow.send())}>
      {flow.busy && <ActivityIndicator color={Colors.white} />}
      <Text style={styles.primaryText}>{flow.busy ? (flow.sent ? 'Vérification…' : 'Envoi…') : flow.confirmed ? 'Continuer' : flow.sent ? 'Confirmer le code' : flow.cooldown > 0 ? `Réessayer dans ${flow.cooldown} s` : 'Recevoir le code'}</Text>
    </TouchableOpacity>
    {flow.sent && !flow.confirmed && <TouchableOpacity accessibilityRole="button"
      accessibilityState={{ disabled: flow.busy || flow.cooldown > 0 }}
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
  return <SafeAreaView style={styles.backdrop}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={styles.panel} accessibilityViewIsModal>
          <View style={styles.brandRow}>
            <View style={styles.badge}><Ionicons name="shield-checkmark-outline" size={24} color="#C43F00" accessible={false} /></View>
            <Text style={styles.brand}>Zwanga</Text>
          </View>
          {children}
          <View style={styles.footer}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: help }}
              style={styles.secondary} onPress={() => setHelp(value => !value)}>
              <Text style={styles.helpLink}>Besoin d’aide ?</Text>
            </TouchableOpacity>
            {help && <View style={styles.help}>
              <Text style={styles.body}>SMS non reçu ou numéro inaccessible ? Contactez-nous. Ne partagez jamais votre code.</Text>
              <TouchableOpacity accessibilityRole="link" style={styles.secondary} onPress={() => {
                void Linking.openURL(`mailto:${DEFAULT_SUPPORT_EMAIL}`).catch(() => setError(`Écrivez à ${DEFAULT_SUPPORT_EMAIL} depuis votre messagerie.`));
              }}><Text style={styles.link}>Contacter l’assistance</Text></TouchableOpacity>
            </View>}
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}
              disabled={busy} style={styles.secondary} onPress={() => void logout()}>
              <Text style={styles.logout}>{busy ? 'Déconnexion…' : 'Se déconnecter'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export const accountPhoneStyles = StyleSheet.create({
  form: { gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#172645' },
  body: { fontSize: 15, lineHeight: 22, color: Colors.gray[700] },
  primary: { minHeight: 52, padding: 16, borderRadius: 14, backgroundColor: '#C43F00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: Colors.white, fontWeight: '700', fontSize: 17, flexShrink: 1, textAlign: 'center' },
  error: { color: '#A32424', fontSize: 15, lineHeight: 22 },
});
const styles = StyleSheet.create({
  ...accountPhoneStyles,
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 26, 44, 0.46)' },
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 20, borderRadius: 24, backgroundColor: Colors.white, gap: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFF1E8', alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 20, fontWeight: '700', color: '#172645' },
  heading: { gap: 8 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[200] },
  phone: { fontSize: 20, fontWeight: '600', color: Colors.gray[900], flexShrink: 1 },
  hint: { fontSize: 13, lineHeight: 18, color: Colors.gray[600] },
  codeRow: { flexDirection: 'row', gap: 6 },
  digit: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 0, textAlign: 'center', fontSize: 24, color: Colors.gray[900], borderWidth: 1, borderColor: Colors.gray[400], borderRadius: 10 },
  filled: { borderColor: '#C43F00' },
  disabled: { opacity: 0.5 },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  footer: { borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 4 },
  helpLink: { color: Colors.gray[700], fontSize: 15, fontWeight: '600', textAlign: 'center' },
  logout: { color: Colors.gray[600], fontSize: 14, textAlign: 'center' },
  link: { color: '#A73700', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  help: { gap: 4, paddingVertical: 8 },
});
