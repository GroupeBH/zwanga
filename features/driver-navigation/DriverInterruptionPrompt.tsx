import { Colors } from '@/constants/styles';
import type { Booking } from '@/types';
import { getTripInterruptionReasonLabel } from '@/utils/tripInterruption';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  booking: Booking;
  queuedCount: number;
  busy: boolean;
  confirming: boolean;
  rejecting: boolean;
  onConfirm: (booking: Booking) => void;
  onReject: (booking: Booking) => void;
}

/** Urgent actions stay outside the scroll area used for secondary route details. */
export function DriverInterruptionPrompt(props: Props) {
  return <View style={styles.card}>
    <View style={styles.heading}>
      <Ionicons name="walk-outline" size={22} color={Colors.danger} />
      <Text style={styles.title}>Demande de descente{props.queuedCount > 0 ? ` (+${props.queuedCount})` : ''}</Text>
    </View>
    <Text style={styles.name} numberOfLines={1}>{props.booking.passengerName || 'Passager'}</Text>
    {props.booking.numberOfSeats > 1 && <Text style={styles.reason}>Pour les {props.booking.numberOfSeats} places de sa réservation</Text>}
    <Text style={styles.reason}>Motif : {getTripInterruptionReasonLabel(props.booking.interruptionRequest?.reason)}</Text>
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la demande de descente"
        accessibilityState={{ disabled: props.busy, busy: props.rejecting }}
        disabled={props.busy} onPress={() => props.onReject(props.booking)}
        style={[styles.button, styles.reject, props.busy && styles.disabled]}>
        {props.rejecting ? <ActivityIndicator color={Colors.danger} /> : <Ionicons name="close" size={20} color={Colors.danger} />}
        <Text style={[styles.buttonText, styles.rejectText]}>Refuser</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirmer la descente du passager"
        accessibilityState={{ disabled: props.busy, busy: props.confirming }}
        disabled={props.busy} onPress={() => props.onConfirm(props.booking)}
        style={[styles.button, styles.confirm, props.busy && styles.disabled]}>
        {props.confirming ? <ActivityIndicator color={Colors.white} /> : <Ionicons name="checkmark" size={20} color={Colors.white} />}
        <Text style={[styles.buttonText, styles.confirmText]}>Confirmer</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: '#F6CDCF', padding: 12, gap: 6 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: Colors.danger, fontSize: 13, fontWeight: '700' },
  name: { color: Colors.gray[900], fontSize: 17, fontWeight: '700' },
  reason: { color: Colors.gray[600], fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  button: { flex: 1, minWidth: 110, minHeight: 44, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  reject: { borderWidth: 1, borderColor: '#F6CDCF' },
  confirm: { backgroundColor: Colors.danger },
  buttonText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  rejectText: { color: Colors.danger },
  confirmText: { color: Colors.white },
  disabled: { opacity: 0.6 },
});
