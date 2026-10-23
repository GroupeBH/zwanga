import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { isDriverAccount } from '@/utils/accountRole';
import { useDriverFullScreenPermission } from '@/hooks/notifications/useDriverFullScreenPermission';
import { Colors } from '@/constants/styles';

export function DriverFullScreenPreference() {
  const user = useAppSelector(selectUser);
  const active = useScreenIsActive();
  const driverId = user && isDriverAccount(user) ? user.id : undefined;
  const { permission, busy: saving, error, setOptIn } = useDriverFullScreenPermission(driverId, active);
  const [explaining, setExplaining] = useState(false);
  const busy = saving || explaining;
  const owner = useRef(driverId); owner.current = driverId;
  const foreground = useRef(active); foreground.current = active;
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    const lifecycle = generation;
    ++lifecycle.current;
    inFlight.current = false; setExplaining(false);
    return () => { ++lifecycle.current; };
  }, [active, driverId]);
  if (Platform.OS !== 'android' || !permission || !driverId) return null;

  const change = (value: boolean) => {
    if (!active || busy || inFlight.current) return;
    const epoch = generation.current;
    const current = () => generation.current === epoch && owner.current === driverId && foreground.current;
    inFlight.current = true; setExplaining(true);
    const finish = () => { if (current()) { inFlight.current = false; setExplaining(false); } };
    const apply = async () => {
      if (!current()) return;
      try { await setOptIn(value); }
      finally { finish(); }
    };
    if (!value) { void apply(); return; }
    let accepted = false;
    Alert.alert('Afficher les demandes sur l’écran verrouillé ?',
      'Une demande proche ou une réservation pourra apparaître en plein écran pour vous permettre de répondre rapidement. ' +
      'Les détails restent protégés par le verrouillage. Cette option est facultative.\n\n' +
      (Number(Platform.Version) >= 34
        ? 'Si Android vous le demande, activez « Autoriser les notifications en plein écran », puis revenez dans Zwanga avec le bouton Retour.'
        : 'Vous pourrez désactiver cette option ici à tout moment.'),
      [{ text: 'Pas maintenant', style: 'cancel', onPress: finish },
        { text: 'Continuer', onPress: () => { accepted = true; void apply(); } }],
      { cancelable: true, onDismiss: () => { if (!accepted) finish(); } });
  };
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ flex: 1, fontSize: 17, color: Colors.gray[900], fontWeight: '600' }}>Demandes en plein écran</Text>
      <Switch value={permission.optIn} disabled={busy || !active} accessibilityLabel="Autoriser les demandes sur l’écran verrouillé"
        onValueChange={change} />
    </View>
    <Text style={{ fontSize: 15, lineHeight: 22, color: Colors.gray[700] }}>
      {permission.optIn && permission.allowed && permission.notificationsAllowed
        ? 'Autorisation activée. Les demandes peuvent s’afficher sur l’écran verrouillé, selon les réglages du téléphone.'
        : 'Affichez une demande ou une réservation sur l’écran verrouillé. Sans cette option, vous gardez les notifications habituelles.'}
    </Text>
    {permission.optIn && !permission.allowed && <TouchableOpacity accessibilityRole="button" disabled={busy || !active}
      style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => change(true)}>
      <Text style={{ color: Colors.primary, fontWeight: '600' }}>Autorisation Android à activer · Continuer</Text>
    </TouchableOpacity>}
    {permission.optIn && !permission.notificationsAllowed && <Text style={{ color: Colors.gray[700] }}>
      Les notifications sont désactivées. Autorisez aussi les notifications Zwanga dans les réglages du téléphone.
    </Text>}
    {error && <Text accessibilityRole="alert" style={{ color: Colors.gray[700] }}>Impossible de vérifier cette option. Réessayez ; vos réglages de notifications ne sont pas modifiés.</Text>}
  </View>;
}
