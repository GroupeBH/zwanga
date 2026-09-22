import { Colors } from '@/constants/styles';
import { DriverBookingRevenue } from '@/features/driver-payments/DriverBookingRevenue';
import { ConfirmCashReceipt } from '@/features/driver-payments/ConfirmCashReceipt';
import type { Booking } from '@/types';
import React, { memo, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function getConfirmedDropoffs(bookings: Booking[], tripId: string) {
  const time = (booking: Booking) => Date.parse(booking.droppedOffAt ?? booking.droppedOffConfirmedAt ?? booking.updatedAt) || 0;
  return bookings.filter(booking => booking.tripId === tripId &&
    (booking.status === 'completed' || (booking.status === 'accepted' &&
      (booking.droppedOff || booking.droppedOffConfirmedByPassenger || booking.droppedOffAt))))
    .sort((a, b) => time(b) - time(a) || a.id.localeCompare(b.id));
}

export const DriverDropoffReceipts = memo(function DriverDropoffReceipts({ bookings, tripId, active }: {
  bookings: Booking[];
  tripId: string;
  active: boolean;
}) {
  const completed = useMemo(() => getConfirmedDropoffs(bookings, tripId), [bookings, tripId]);
  const [selection, setSelection] = useState<{ latestId: string; bookingId: string } | null>(null);
  const latest = completed[0];
  const selected = selection?.latestId === latest?.id
    ? completed.find(booking => booking.id === selection?.bookingId) ?? latest : latest;
  if (!selected) return null;
  return <View style={styles.card}>
    <Text style={styles.title}>Dépose confirmée · {selected.passengerName || 'Passager'}</Text>
    {completed.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
      {completed.map(booking => <TouchableOpacity key={booking.id} style={[styles.choice, selected.id === booking.id && styles.selected]}
        onPress={() => setSelection({ latestId: latest.id, bookingId: booking.id })}
        accessibilityRole="button" accessibilityState={{ selected: selected.id === booking.id }}>
        <Text style={styles.choiceText}>{booking.passengerName || 'Passager'}</Text>
      </TouchableOpacity>)}
    </ScrollView>}
    <DriverBookingRevenue bookingId={selected.id} active={active} cashReceived={Boolean(selected.cashReceivedAt)} />
    <ConfirmCashReceipt booking={selected} />
  </View>;
});

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 18, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200], gap: 4 },
  title: { color: Colors.gray[900], fontSize: 14, fontWeight: '700' },
  choices: { gap: 6 },
  choice: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.gray[100] },
  selected: { backgroundColor: '#FFF0E6' },
  choiceText: { fontSize: 12, color: Colors.gray[800] },
});
