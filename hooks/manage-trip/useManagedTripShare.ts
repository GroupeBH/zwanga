import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import { useDialog } from '@/components/ui/DialogProvider';
import { shareTrip } from '@/utils/shareHelpers';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Trip } from '@/types';

export function useManagedTripShare(trip?: Trip) {
  const [createLink] = useCreateTripShareLinkMutation();
  const { showDialog } = useDialog();
  return async () => {
    if (!trip) return;
    try {
      const response = await createLink({ tripId: trip.id }).unwrap();
      await shareTrip(response.publicUrl, trip.departure?.name, trip.arrival?.name);
    } catch (error) {
      showDialog({ variant: 'danger', title: 'Partage impossible',
        message: getApiErrorMessage(error, 'Impossible de créer le lien de suivi. Réessayez.') });
    }
  };
}
