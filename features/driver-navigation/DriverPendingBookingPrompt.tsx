import { Colors } from '@/constants/styles';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatPendingBookingPayment, formatSeatCount } from './navigationPresentation';

interface Props {
  booking: Booking;
  queuedCount: number;
  pickupLabel: string;
  dropoffLabel: string;
  tripPrice?: number;
  busy: boolean;
  accepting: boolean;
  rejecting: boolean;
  onAccept: (booking: Booking) => Promise<void>;
  onReject: (booking: Booking) => Promise<void>;
  onContact: (passengerId: string) => void;
}

/** Only the copy scrolls: accepting/refusing must never be below a clipped list. */
export function DriverPendingBookingPrompt(props: Props) {
  return <View style={styles.card}>
    <ScrollView style={styles.body} contentContainerStyle={styles.copy} bounces={false}
      showsVerticalScrollIndicator key={props.booking.id}>
      <Text style={styles.eyebrow}>Nouvelle réservation{props.queuedCount > 0 ? ` (+${props.queuedCount})` : ''}</Text>
      <Text style={styles.name} numberOfLines={1}>{props.booking.passengerName || 'Passager'}</Text>
      <Text style={styles.meta}>{formatSeatCount(props.booking.numberOfSeats)} · {formatPendingBookingPayment(props.booking, props.tripPrice)}</Text>
      <View style={styles.routeRow}>
        <View style={[styles.dot, styles.pickupDot]} />
        <Text style={styles.routeLabel} numberOfLines={2} accessibilityLabel={`Départ : ${props.pickupLabel}`}>{props.pickupLabel}</Text>
      </View>
      <View style={styles.routeRow}>
        <View style={[styles.dot, styles.dropoffDot]} />
        <Text style={styles.routeLabel} numberOfLines={2} accessibilityLabel={`Destination : ${props.dropoffLabel}`}>{props.dropoffLabel}</Text>
      </View>
    </ScrollView>
    <TouchableOpacity style={[styles.contact, props.busy && styles.disabled]}
      accessibilityRole="button" accessibilityLabel={`Contacter ${props.booking.passengerName || 'le passager'} avant d’accepter`}
      disabled={props.busy} onPress={() => props.onContact(props.booking.passengerId)}>
      <Ionicons name="call-outline" size={18} color={Colors.primaryDark} />
      <Text style={[styles.buttonText, styles.contactText]}>Contacter avant d’accepter</Text>
    </TouchableOpacity>
    <View style={styles.actions}>
      <TouchableOpacity style={[styles.button, styles.reject, props.busy && styles.disabled]}
        accessibilityRole="button" accessibilityLabel="Refuser la réservation"
        accessibilityState={{ disabled: props.busy, busy: props.rejecting }}
        disabled={props.busy} activeOpacity={0.85} onPress={() => void props.onReject(props.booking)}>
        {props.rejecting ? <ActivityIndicator size="small" color={Colors.danger} /> : <Ionicons name="close" size={18} color={Colors.danger} />}
        <Text style={[styles.buttonText, styles.rejectText]}>Refuser</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.accept, props.busy && styles.disabled]}
        accessibilityRole="button" accessibilityLabel="Accepter la réservation"
        accessibilityState={{ disabled: props.busy, busy: props.accepting }}
        disabled={props.busy} activeOpacity={0.85} onPress={() => void props.onAccept(props.booking)}>
        {props.accepting ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="checkmark" size={18} color={Colors.white} />}
        <Text style={[styles.buttonText, styles.acceptText]}>Accepter</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { flexShrink: 1, minHeight: 0, padding: 12, gap: 10, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: '#FFD8C6', borderRadius: 18 },
  body: { flexGrow: 0, flexShrink: 1, maxHeight: 150 },
  copy: { gap: 4, paddingBottom: 2 },
  eyebrow: { color: Colors.primaryDark, fontSize: 12, fontWeight: '700' },
  name: { color: Colors.gray[900], fontSize: 16, fontWeight: '700' },
  meta: { color: Colors.gray[600], fontSize: 12, marginBottom: 2 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pickupDot: { backgroundColor: Colors.secondary },
  dropoffDot: { backgroundColor: Colors.success },
  routeLabel: { flex: 1, color: Colors.gray[800], fontSize: 13, lineHeight: 18 },
  actions: { flexShrink: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contact: { flexShrink: 0, minHeight: 44, padding: 8, borderRadius: 12, backgroundColor: '#FFF4EC',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  contactText: { color: Colors.primaryDark },
  button: { flex: 1, minWidth: 110, minHeight: 44, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  buttonText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  reject: { borderWidth: 1, borderColor: '#F6CDCF' },
  rejectText: { color: Colors.danger },
  accept: { backgroundColor: Colors.primary },
  acceptText: { color: Colors.white },
  disabled: { opacity: 0.6 },
});
