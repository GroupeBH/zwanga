import { useCallback } from 'react';
import type { useDialog } from '@/components/ui/DialogProvider';
import type { TripStatus } from '@/types';

/** Leaving the map does not pause the trip or confirm a passenger's decision. */
export function useDriverNavigationExitPrompt({ status, interruptionPending, navigateBackSafely, showDialog }: {
  status: TripStatus | undefined;
  interruptionPending: boolean;
  navigateBackSafely: () => void;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
}) {
  return useCallback(() => {
    if (interruptionPending || (status !== undefined && status !== 'ongoing')) {
      navigateBackSafely();
      return;
    }
    showDialog({
      title: 'Quitter la navigation',
      message: 'Voulez-vous quitter le guidage GPS ? Le trajet reste en cours.',
      variant: 'warning',
      icon: 'exit-outline',
      actions: [
        { label: 'Quitter', variant: 'primary', onPress: navigateBackSafely },
        { label: 'Annuler', variant: 'secondary' },
      ],
    });
  }, [interruptionPending, navigateBackSafely, showDialog, status]);
}
