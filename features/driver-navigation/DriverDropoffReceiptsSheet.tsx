import { Colors } from '@/constants/styles';
import { ConfirmCashReceipt } from '@/features/driver-payments/ConfirmCashReceipt';
import { DriverBookingRevenue } from '@/features/driver-payments/DriverBookingRevenue';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, type ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const bookingKey = (booking: Booking) => booking.id;

/** One expanded receipt, virtualized names; no independent poller or native modal. */
export const DriverDropoffReceiptsSheet = memo(function DriverDropoffReceiptsSheet({ bookings, active, onClose }: {
  bookings: Booking[]; active: boolean; onClose: () => void;
}) {
  const [selection, setSelection] = useState(bookings[0]?.id);
  // A new dropoff must not interrupt a cash confirmation already open for another passenger.
  const selectedId = bookings.some(booking => booking.id === selection) ? selection : bookings[0]?.id;
  const renderItem = useCallback<ListRenderItem<Booking>>(({ item }) => <View style={styles.row}>
    <TouchableOpacity style={styles.passenger} activeOpacity={0.8} onPress={() => setSelection(item.id)}
      accessibilityRole="button" accessibilityState={{ expanded: selectedId === item.id }}
      accessibilityLabel={`Voir le gain de ${item.passengerName || 'ce passager'}`}>
      <View style={[styles.dot, selectedId === item.id && styles.dotSelected]} />
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={2}>{item.passengerName || 'Passager'}</Text>
        <Text style={styles.status}>{item.cashReceivedAt ? 'Cash reçu confirmé' : 'Dépose confirmée'} · {item.numberOfSeats ?? 1} place(s)</Text>
      </View>
      <Ionicons name={selectedId === item.id ? 'chevron-down' : 'chevron-forward'} size={18} color={Colors.gray[500]} />
    </TouchableOpacity>
    {selectedId === item.id && <View style={styles.details}>
      {item.numberOfSeats > 1 && <Text style={styles.status}>Montants pour l’ensemble des {item.numberOfSeats} places réservées.</Text>}
      <DriverBookingRevenue bookingId={item.id} active={active} cashReceived={Boolean(item.cashReceivedAt)} />
      <ConfirmCashReceipt booking={item} />
    </View>}
  </View>, [active, selectedId]);
  return <View style={styles.overlay}>
    <SafeAreaView edges={['bottom']} style={styles.sheet}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <Text style={styles.title}>Gains par réservation</Text>
          <Text style={styles.subtitle}>{bookings.length} réservation{bookings.length > 1 ? 's' : ''} terminée{bookings.length > 1 ? 's' : ''} · À consulter à l’arrêt</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Fermer les gains par passager">
          <Ionicons name="close" size={24} color={Colors.gray[800]} />
        </TouchableOpacity>
      </View>
      <FlatList data={bookings} keyExtractor={bookingKey} renderItem={renderItem} extraData={selectedId}
        style={styles.list} contentContainerStyle={styles.content} initialNumToRender={6} maxToRenderPerBatch={6}
        windowSize={3} removeClippedSubviews={false} showsVerticalScrollIndicator bounces={false} />
    </SafeAreaView>
  </View>;
});

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 20, 30, 0.4)' },
  sheet: { height: '80%', width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200] },
  identity: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.gray[900] },
  subtitle: { color: Colors.gray[600], fontSize: 12, lineHeight: 18, marginTop: 4 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.gray[100] },
  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 20 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200] },
  passenger: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gray[300] },
  dotSelected: { backgroundColor: Colors.primary },
  name: { fontSize: 14, fontWeight: '600', color: Colors.gray[900] },
  status: { fontSize: 11, color: Colors.gray[600], marginTop: 3 },
  details: { paddingBottom: 16, paddingLeft: 18 },
});
