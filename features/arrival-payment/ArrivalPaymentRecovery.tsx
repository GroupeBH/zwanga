import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { formatMoney } from './paymentModel';
import { useBookingPaymentOptionsQuery } from '@/store/api/driverFinanceApi';

type Props = {
  bookingId: string;
  pending: boolean;
  busy: boolean;
  savingCash?: boolean;
  pendingCashAllowed?: boolean;
  beforeArrival: boolean;
  amount: number | null;
  currency: string;
  destination: string;
  message?: string;
  onVerify: () => void;
  onChange: () => void;
  onCash: () => Promise<void>;
  onClose: () => void;
  onHelp: () => void;
  onResumeCard?: () => void;
};

/** A single status and a useful next step, not a long disabled payment form. */
export function ArrivalPaymentRecovery(props: Props) {
  const { currentData: options, isError } = useBookingPaymentOptionsQuery(props.bookingId, {
    skip: (props.pending && !props.pendingCashAllowed) || props.beforeArrival,
    refetchOnMountOrArgChange: true,
  });
  const cashAllowed = (!props.pending || props.pendingCashAllowed) && !props.beforeArrival && props.amount !== null && !isError &&
    options?.acceptedPaymentModes.includes('cash') && options.availablePaymentModes.includes('cash');
  const total = props.amount === null ? 'Montant à vérifier' : formatMoney(props.amount, props.currency);
  const busyLabel = props.savingCash ? 'Passage aux espèces…' : 'Vérification du paiement…';
  return <View style={s.container}>
    <View style={s.header}>
      <Text style={s.headerTitle} accessibilityRole="header">Paiement du trajet</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer le paiement pour le moment"
        accessibilityHint="Vous pourrez le reprendre depuis l’accueil."
        onPress={props.onClose} style={s.close}>
        <Ionicons name="close" size={24} color={Colors.gray[800]} />
      </TouchableOpacity>
    </View>
    {/* One scroll surface includes every action, even with large fonts or in
        landscape. Only the close button stays outside, and is never disabled. */}
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.summary}>
        <Text style={s.amountLabel}>Montant du trajet</Text>
        <Text style={s.amount}>{total}</Text>
        <Text style={s.destination}>{props.destination}</Text>
      </View>
      <View style={s.status}>
        <Ionicons name={props.pending ? 'time-outline' : 'alert-circle-outline'} size={22} color={Colors.primaryDark} />
        <Text style={s.title}>{props.savingCash ? 'Paiement en espèces' : props.pending ? 'Paiement non confirmé' : 'Le paiement n’a pas abouti'}</Text>
      </View>
      <Text style={s.message} accessibilityLiveRegion="polite">{props.savingCash
        ? 'Nous enregistrons votre choix. La remise des espèces se fait au conducteur.'
        : props.message || (props.pending && cashAllowed
          ? 'Payez le montant total en espèces. Vos jetons et toute recharge confirmée plus tard restent dans votre portefeuille.'
          : props.pending
          ? props.onResumeCard ? 'Terminez le paiement par carte, ou vérifiez son résultat si vous avez déjà payé.'
            : 'Nous attendons le résultat du paiement. Vérifiez avant de payer une deuxième fois.'
          : cashAllowed ? 'Vous pouvez payer le conducteur en espèces ou choisir un autre moyen.' : 'Choisissez un autre moyen de paiement ou réessayez.')}</Text>
      {!(props.pending && cashAllowed) && <Text style={s.reassurance}>Vous pouvez fermer cette fenêtre et reprendre plus tard.</Text>}
      <View style={s.actions}>
        <TouchableOpacity accessibilityRole="button" disabled={props.busy}
          accessibilityState={{ disabled: props.busy, busy: props.busy }} style={[s.primary, props.busy && s.disabled]}
          onPress={() => {
            if (props.busy) return;
            if (cashAllowed) void props.onCash(); else if (props.pending) props.onVerify(); else props.onChange();
          }}>
          {props.busy && <ActivityIndicator color={Colors.gray[700]} />}
          <Text style={[s.primaryText, props.busy && s.busyText]}>{props.busy ? busyLabel : cashAllowed ? `Payer ${total} en espèces`
            : props.pending ? 'Vérifier mon paiement' : 'Choisir comment payer'}</Text>
        </TouchableOpacity>
        {props.pending && cashAllowed && <TouchableOpacity accessibilityRole="button" disabled={props.busy}
          style={s.secondary} onPress={() => { if (!props.busy) props.onVerify(); }}>
          <Text style={s.link}>Vérifier Mobile Money</Text>
        </TouchableOpacity>}
        {props.pending && props.onResumeCard && <TouchableOpacity accessibilityRole="button"
          disabled={props.busy} style={s.secondary} onPress={() => { if (!props.busy) props.onResumeCard?.(); }}>
          <Text style={s.link}>Reprendre le paiement par carte</Text>
        </TouchableOpacity>}
        {!props.pending && cashAllowed && <TouchableOpacity accessibilityRole="button"
          disabled={props.busy} style={s.secondary} onPress={() => { if (!props.busy) props.onChange(); }}>
          <Text style={s.link}>Autre moyen de paiement</Text>
        </TouchableOpacity>}
        {props.pending && <TouchableOpacity accessibilityRole="button" onPress={props.onHelp} style={s.secondary}>
          <Text style={s.link}>Contacter l’aide</Text>
        </TouchableOpacity>}
      </View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12, flexShrink: 0 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.gray[900] },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, minHeight: 0 }, content: { flexGrow: 1, paddingBottom: 4 },
  summary: { paddingTop: 12, paddingBottom: 20, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200] },
  amountLabel: { fontSize: 14, color: Colors.gray[600] },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 20 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.gray[900] },
  amount: { fontSize: 32, fontWeight: '700', color: Colors.gray[900] },
  destination: { fontSize: 15, color: Colors.gray[600] },
  message: { fontSize: 16, lineHeight: 24, color: Colors.gray[700], marginTop: 8 },
  reassurance: { fontSize: 14, lineHeight: 21, color: Colors.gray[600], marginTop: 12, marginBottom: 24 },
  actions: { marginTop: 'auto', paddingTop: 12, gap: 4 },
  primary: { minHeight: 52, padding: 14, borderRadius: 14, backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { backgroundColor: Colors.gray[100] }, busyText: { color: Colors.gray[700] },
  primaryText: { color: Colors.white, fontSize: 17, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  secondary: { minHeight: 44, padding: 12, alignItems: 'center', justifyContent: 'center' },
  link: { color: Colors.primaryDark, fontSize: 16, fontWeight: '600' },
});
