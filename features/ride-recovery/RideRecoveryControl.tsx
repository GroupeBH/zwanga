import { FormModal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { rideOutbox } from '@/services/rideOutbox';
import { useGetRideDeclarationsQuery } from '@/store/api/rideRecoveryApi';
import { useAppSelector } from '@/store/hooks';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RideOutboxError } from './rideOutboxEngine';
import { rideBookingStages, rideRecoveryTrigger } from './rideRecoveryPresentation';
import {
  isNearRideStop,
  rideEntryMessage,
  type RideDecision,
  type RideOutboxEntry,
  type RideSnapshot,
  type RideStage,
} from './rideRecoveryModel';

const EMPTY_BOOKINGS: Booking[] = [];
const EMPTY_SNAPSHOTS: RideSnapshot[] = [];
const EMPTY_ENTRIES: RideOutboxEntry[] = [];
export interface RecoveryFix { latitude: number; longitude: number; recordedAt: number; accuracy?: number }
interface Props {
  tripId: string;
  booking?: Booking;
  bookings?: Booking[];
  actor: 'driver' | 'passenger';
  compact?: boolean;
  fix?: RecoveryFix | null;
  destination?: { latitude: number; longitude: number } | null;
}

export const RideRecoveryControl = memo(function RideRecoveryControl({ tripId, booking, bookings = EMPTY_BOOKINGS, actor, compact, fix, destination }: Props) {
  const active = useScreenIsActive();
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const recovery = useAppSelector(state => state.rideRecovery);
  const userId = useAppSelector(state => state.auth.user?.id);
  const [visible, setVisible] = useState(false);
  const [choice, setChoice] = useState<{ bookingId: string; stage: RideStage; decision: RideDecision } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delayed, setDelayed] = useState(false);
  const entries = recovery.userId === userId ? recovery.entries : EMPTY_ENTRIES;
  const relevant = useMemo(() => (booking ? [booking] : bookings).filter(item => ['accepted', 'completed'].includes(item.status)), [booking, bookings]);
  const { currentData: snapshots = EMPTY_SNAPSHOTS, isError, refetch } = useGetRideDeclarationsQuery(
    actor === 'passenger' ? { bookingId: booking?.id } : { tripId },
    { skip: !active || !tripId || !online, pollingInterval: active ? 30_000 : 0, skipPollingIfUnfocused: true, refetchOnFocus: true, refetchOnReconnect: true },
  );
  const bookingRows = useMemo(() => relevant.map(item => ({
    item, stages: rideBookingStages(item, snapshots.find(value => value.bookingId === item.id), entries, actor),
  })), [actor, entries, relevant, snapshots]);
  const trigger = useMemo(() => rideRecoveryTrigger(actor, bookingRows.flatMap(row => row.stages.filter(stage => !stage.unavailable).map(stage => stage.stage))), [actor, bookingRows]);
  const nearStop = relevant.some(item => {
    const pickedUp = item.pickedUp || snapshots.find(snapshot => snapshot.bookingId === item.id)?.pickup.status === 'confirmed';
    return !item.droppedOff && isNearRideStop(fix ?? null, pickedUp ? (item.passengerDestinationCoordinates ?? destination) : item.passengerOriginCoordinates);
  });
  useEffect(() => {
    setDelayed(false);
    if (!active || !nearStop) return;
    const timer = setTimeout(() => setDelayed(true), 20_000);
    return () => clearTimeout(timer);
  }, [active, nearStop]);
  const hasPending = entries.some(entry => entry.tripId === tripId && entry.state !== 'confirmed') || snapshots.some(snapshot =>
    [snapshot.pickup, snapshot.dropoff].some(stage => stage.status === 'awaiting_other' || stage.status === 'disputed'));

  const saveChoice = async () => {
    if (!choice || saving) return;
    setSaving(true);
    setError(null);
    try {
      const freshFix = fix && Date.now() - fix.recordedAt <= 30_000 && Date.now() >= fix.recordedAt && (fix.accuracy ?? 0) <= 100 ? fix : null;
      await rideOutbox.enqueue({ ...choice, tripId, ...(freshFix ? {
        latitude: freshFix.latitude, longitude: freshFix.longitude, accuracy: freshFix.accuracy,
      } : {}) });
      setChoice(null);
      // Sending is owned by the coordinator, not by a modal's lifetime.
    } catch (err) {
      setError(err instanceof RideOutboxError ? err.message : 'Impossible d’enregistrer la confirmation sur ce téléphone. Réessayez avant de quitter cet écran.');
    } finally { setSaving(false); }
  };
  const close = () => { if (!saving) { setVisible(false); setChoice(null); setError(null); } };
  const highlighted = delayed || hasPending || !online || isError;
  return <>
    <TouchableOpacity onPress={() => setVisible(true)} style={[styles.trigger, compact && styles.compact, highlighted && styles.triggerHighlighted]}
      accessibilityRole="button" accessibilityLabel={trigger.accessibilityLabel} accessibilityHint="Ouvre les étapes du trajet à vérifier avant de confirmer.">
      <Ionicons name={trigger.icon} size={20} color={Colors.primaryDark} />
      <Text style={styles.triggerLabel}>{trigger.label}</Text>
      {!compact && <Ionicons name="chevron-forward" size={18} color={Colors.gray[600]} />}
    </TouchableOpacity>
    {!compact && highlighted && <Text style={styles.hint}>{!online ? 'Connexion indisponible : vos confirmations peuvent être enregistrées sur ce téléphone.' : hasPending ? 'Une confirmation du trajet est en attente.' : 'La validation tarde ? Confirmez votre embarquement ou votre arrivée.'}</Text>}
    <FormModal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.heading}><Text style={styles.title}>Confirmer une étape</Text><Text style={styles.subtitle}>{actor === 'driver' ? 'Effectuez cette action uniquement à l’arrêt.' : 'Même lorsque la connexion est faible.'}</Text></View>
            <TouchableOpacity onPress={close} disabled={saving} style={styles.close} accessibilityRole="button" accessibilityLabel="Fermer les confirmations"><Ionicons name="close" size={25} color={Colors.gray[800]} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.explanation}>Chaque personne confirme pour elle-même. L’autre personne pourra répondre quand elle retrouvera une connexion. Aucune confirmation locale ne vaut paiement.</Text>
            {isError && <Text style={styles.notice}>Le serveur n’est pas joignable pour le moment. Les informations ci-dessous peuvent ne pas être à jour.</Text>}
            {relevant.length === 0 && <Text style={styles.explanation}>Aucune réservation à confirmer pour ce trajet.</Text>}
            {bookingRows.map(({ item, stages }) => {
              return <View key={item.id} style={styles.booking}>
                {actor === 'driver' && <Text style={styles.passenger}>{item.passengerName || 'Passager'} · {item.numberOfSeats} place{item.numberOfSeats > 1 ? 's' : ''}</Text>}
                {stages.map(({ stage, entry, status, canArrive, unavailable, other, label }) => {
                  return <View key={stage} style={styles.stage}>
                    <View style={styles.stageHeading}><Ionicons name={status === 'confirmed' ? 'checkmark-circle' : stage === 'pickup' ? 'car-outline' : 'flag-outline'} size={23} color={status === 'confirmed' ? Colors.successDark : Colors.primary} /><Text style={styles.stageTitle}>{stage === 'pickup' ? 'Embarquement' : 'Arrivée'}</Text></View>
                    <Text style={styles.status} accessibilityLiveRegion="polite">{rideEntryMessage(entry, status)}</Text>
                    {!unavailable && <View style={styles.actions}>
                      <TouchableOpacity style={styles.confirm} onPress={() => setChoice({ bookingId: item.id, stage, decision: 'confirm' })} accessibilityRole="button"><Text style={styles.confirmLabel}>{label}</Text></TouchableOpacity>
                      {other === 'confirm' && <TouchableOpacity style={styles.reject} onPress={() => setChoice({ bookingId: item.id, stage, decision: 'reject' })} accessibilityRole="button"><Text style={styles.rejectLabel}>Ce n’est pas exact</Text></TouchableOpacity>}
                    </View>}
                    {stage === 'dropoff' && !canArrive && status !== 'confirmed' && <Text style={styles.hint}>Confirmez d’abord votre embarquement.</Text>}
                  </View>;
                })}
              </View>;
            })}
          </ScrollView>
          {choice && <View style={styles.review}>
            <Text style={styles.stageTitle}>{choice.decision === 'reject' ? 'Signaler votre désaccord ?' : choice.stage === 'pickup' ? 'L’embarquement a bien eu lieu ?' : 'Vous confirmez l’arrivée à destination ?'}</Text>
            <Text style={styles.status}>Votre réponse sera sauvegardée, puis transmise au serveur.</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.reject} disabled={saving} onPress={() => setChoice(null)} accessibilityRole="button"><Text style={styles.rejectLabel}>Retour</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirm} disabled={saving} onPress={() => void saveChoice()} accessibilityRole="button">{saving ? <ActivityIndicator color="white" /> : <Text style={styles.confirmLabel}>Enregistrer ma réponse</Text>}</TouchableOpacity>
            </View>
          </View>}
          {(error || recovery.error) && <Text style={styles.error} accessibilityLiveRegion="polite">{error || recovery.error}</Text>}
          {!choice && <TouchableOpacity style={styles.refresh} onPress={() => { if (online && active) void refetch(); }} disabled={!online || !active} accessibilityRole="button"><Text style={styles.rejectLabel}>Actualiser les confirmations</Text></TouchableOpacity>}
        </SafeAreaView>
      </View>
    </FormModal>
  </>;
});

const styles = StyleSheet.create({
  trigger: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200] },
  compact: { alignSelf: 'center', flexDirection: 'column', gap: 2, paddingHorizontal: 8, maxWidth: 126 },
  triggerHighlighted: { borderColor: Colors.primary, backgroundColor: '#FFF4EC' },
  triggerLabel: { color: Colors.primaryDark, fontWeight: '700', fontSize: 12, textAlign: 'center', flexShrink: 1 },
  hint: { color: Colors.gray[600], fontSize: 12, lineHeight: 18, marginTop: 5 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 20, 30, 0.45)' },
  sheet: { height: '85%', backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  heading: { flex: 1 }, title: { color: Colors.gray[900], fontSize: 23, fontWeight: '700' },
  subtitle: { color: Colors.gray[600], fontSize: 13, marginTop: 6 },
  close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22, backgroundColor: Colors.gray[100] },
  content: { padding: 20, paddingBottom: 28, gap: 16 },
  explanation: { fontSize: 14, lineHeight: 21, color: Colors.gray[700] },
  notice: { fontSize: 13, lineHeight: 20, color: Colors.primaryDark, backgroundColor: '#FFF4EC', padding: 12, borderRadius: 12 },
  booking: { borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 12 },
  passenger: { fontSize: 17, fontWeight: '700', color: Colors.gray[900], marginBottom: 12 },
  stage: { paddingVertical: 12, gap: 8 }, stageHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  status: { color: Colors.gray[600], fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  confirm: { flexGrow: 1, minHeight: 48, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { color: Colors.white, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  reject: { minHeight: 48, padding: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.gray[100] },
  rejectLabel: { fontWeight: '600', color: Colors.gray[700], fontSize: 14 },
  review: { borderTopWidth: 1, borderTopColor: Colors.gray[200], padding: 18, gap: 8, backgroundColor: Colors.gray[50] },
  error: { color: Colors.dangerDark, paddingHorizontal: 20, paddingVertical: 10, fontSize: 13 },
  refresh: { alignItems: 'center', padding: 18, minHeight: 48, marginBottom: 8 },
});
