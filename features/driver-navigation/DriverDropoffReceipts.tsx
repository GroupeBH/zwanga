import { Colors } from '@/constants/styles';
import { SwipeableHomePriority } from '@/components/home/SwipeableHomePriority';
import { DriverBookingRevenue } from '@/features/driver-payments/DriverBookingRevenue';
import { RideModal } from '@/features/navigation/RideModal';
import { useRideOverlay } from '@/features/navigation/RideOverlayProvider';
import { Ionicons } from '@expo/vector-icons';
import type { Booking } from '@/types';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DriverDropoffReceiptsSheet } from './DriverDropoffReceiptsSheet';
import { getConfirmedDropoffs, getDropoffReceiptsKey } from './driverDropoffReceiptsModel';

export { getConfirmedDropoffs } from './driverDropoffReceiptsModel';

export const DriverDropoffReceipts = memo(function DriverDropoffReceipts({ bookings, tripId, active }: {
  bookings: Booking[];
  tripId: string;
  active: boolean;
}) {
  const completed = useMemo(() => getConfirmedDropoffs(bookings, tripId), [bookings, tripId]);
  const receiptKey = useMemo(() => getDropoffReceiptsKey(completed, tripId), [completed, tripId]);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const { active: overlay } = useRideOverlay();
  const [openedTrip, setOpenedTrip] = useState<string | null>(null);
  const close = useCallback(() => setOpenedTrip(null), []);
  useEffect(close, [active, tripId, close]);
  const visible = active && openedTrip === tripId;
  const interactive = active && !visible && !overlay;
  const dismiss = useCallback((key: string) => {
    if (interactive && key === receiptKey) setDismissedKey(key);
  }, [interactive, receiptKey]);
  const latest = completed[0];
  if (!latest || dismissedKey === receiptKey) return null;
  return <>
    <SwipeableHomePriority priorityKey={receiptKey} enabled={interactive} onDismiss={dismiss} dismissLabel="Masquer le récapitulatif">
      <TouchableOpacity style={styles.bar} activeOpacity={0.8} onPress={() => { if (interactive) setOpenedTrip(tripId); }} disabled={!interactive}
        accessibilityRole="button" accessibilityState={{ expanded: visible, disabled: !interactive }}
        accessibilityActions={[{ name: 'dismiss', label: 'Masquer le récapitulatif' }]}
        onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'dismiss') dismiss(receiptKey); }}
        accessibilityHint="Ouvre les gains et la confirmation du cash reçu. Glissez à gauche ou à droite pour masquer. Les gains restent dans les options.">
        <View style={styles.icon}><Ionicons name="checkmark-done" size={20} color={Colors.successDark} /></View>
        <View style={styles.identity}>
          <Text style={styles.title} numberOfLines={1}>Déposes · {completed.length}</Text>
          <Text style={styles.name} numberOfLines={1}>{latest.passengerName || 'Passager'}</Text>
        </View>
        <View style={styles.amount}>
          {!visible && <DriverBookingRevenue compact bookingId={latest.id} active={interactive} cashReceived={Boolean(latest.cashReceivedAt)} />}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.gray[500]} />
      </TouchableOpacity>
    </SwipeableHomePriority>
    <RideModal inApp visible={visible} transparent animationType="none" onRequestClose={close}>
      {visible && <DriverDropoffReceiptsSheet bookings={completed} active={active} onClose={close} />}
    </RideModal>
  </>;
});

const styles = StyleSheet.create({
  bar: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: Colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray[200], flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ECF8F0', alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: Colors.gray[900], fontSize: 13, fontWeight: '700' },
  name: { color: Colors.gray[600], fontSize: 12 },
  amount: { flexShrink: 1, maxWidth: '48%' },
});
