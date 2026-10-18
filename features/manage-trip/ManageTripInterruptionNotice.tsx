import React, { useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { useDialog } from '@/components/ui/DialogProvider';
import { useCancelDriverTripInterruptionMutation } from '@/store/api/tripApi';
import type { Trip } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { isPendingTripInterruption } from '@/utils/tripInterruption';

/** Inline follow-up after leaving navigation: no success popup to dismiss. */
export function ManageTripInterruptionNotice({ trip }: { trip: Trip }) {
  const [cancelRequest, { isLoading }] = useCancelDriverTripInterruptionMutation();
  const { showDialog } = useDialog();
  const cancellingRef = useRef(false);
  const request = trip.interruptionRequest;
  const pending = isPendingTripInterruption(request?.status);
  const paused = trip.status === 'upcoming' && ['confirmed', 'completed'].includes(request?.status ?? '');
  const rejected = trip.status === 'ongoing' && request?.status === 'rejected';
  if (!request || (!pending && !paused && !rejected)) return null;
  const cancel = async () => {
    if (isLoading || cancellingRef.current) return;
    cancellingRef.current = true;
    try { await cancelRequest(trip.id).unwrap(); }
    catch (error) {
      showDialog({ variant: 'danger', title: 'Annulation impossible',
        message: getApiErrorMessage(error, "Impossible d’annuler la demande d’interruption pour le moment.") });
    }
    finally { cancellingRef.current = false; }
  };
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <View style={styles.heading}>
        <Ionicons name={pending ? 'hourglass-outline' : paused ? 'pause-circle-outline' : 'information-circle-outline'} size={22} color={Colors.primary} />
        <Text style={styles.title}>{pending ? 'Interruption en attente' : paused ? 'Trajet interrompu' : 'Interruption refusée'}</Text>
      </View>
      <Text style={styles.description}>
        {pending ? `${request.confirmedPassengerCount}/${request.requiredPassengerCount} passager(s) ont confirmé. Le trajet reste en cours jusqu’à l’accord de tous les passagers à bord.`
          : paused ? 'Vous pouvez redémarrer le trajet depuis cet écran.'
            : 'La demande a été refusée. Le trajet reste en cours.'}
      </Text>
      {pending && <TouchableOpacity onPress={() => void cancel()} disabled={isLoading} style={styles.cancel}
        accessibilityRole="button" accessibilityLabel="Annuler la demande d’interruption">
        {isLoading ? <ActivityIndicator color={Colors.primary} size="small" /> : <Text style={styles.cancelText}>Annuler la demande</Text>}
      </TouchableOpacity>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], padding: 16, gap: 8, marginBottom: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  description: { fontSize: 14, lineHeight: 20, color: Colors.gray[600] },
  cancel: { alignSelf: 'flex-start', paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});
