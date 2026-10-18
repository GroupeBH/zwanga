import { useDialog } from '@/components/ui/DialogProvider';
import { RideOverlayContext } from '@/features/navigation/rideOverlayContext';
import { loadNativeReview } from '@/features/store-review/nativeReview';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

export function useStoreReview() {
  const { showDialog } = useDialog();
  const overlays = useContext(RideOverlayContext);
  const isScreenActive = useScreenIsActive();
  const storeName = Platform.OS === 'ios' ? 'App Store' : Platform.OS === 'android' ? 'Google Play' : undefined;
  const [isOpening, setOpening] = useState(false);
  const busy = useRef(false);
  const lifecycle = useRef({ mounted: true, active: isScreenActive, generation: 0 });
  lifecycle.current.active = isScreenActive;

  useEffect(() => {
    const life = lifecycle.current;
    life.mounted = true;
    return () => { life.mounted = false; life.generation += 1; };
  }, []);

  useEffect(() => {
    if (!isScreenActive) {
      lifecycle.current.generation += 1;
      setOpening(false);
    }
  }, [isScreenActive]);

  const openReview = useCallback(async () => {
    const generation = lifecycle.current.generation;
    const isCurrent = () => lifecycle.current.mounted && lifecycle.current.active
      && lifecycle.current.generation === generation && AppState.currentState === 'active';
    const canPresent = () => isCurrent() && !overlays?.isBusy();
    if (!storeName || busy.current || !canPresent()) return;
    busy.current = true;
    setOpening(true);
    try {
      const review = await loadNativeReview();
      if (!canPresent()) return;
      const available = review && await review.isAvailableAsync();
      if (!canPresent()) return;
      if (!available) {
        showDialog({
          title: 'Notation indisponible',
          message: 'La notation dans l’application n’est pas disponible pour le moment sur cet appareil. Vous pouvez continuer à utiliser Zwanga et réessayer plus tard.',
          variant: 'info',
        });
        return;
      }
      // Explicit requests do not advance the automatic successful-trip milestones.
      // The store may silently decline; a resolved call is NOT a submitted review.
      await review.requestReview();
    } catch {
      if (canPresent()) showDialog({
        title: 'Notation indisponible',
        message: 'Impossible d’afficher la fenêtre de notation pour le moment. Réessayez dans quelques instants.',
        variant: 'info',
      });
    } finally {
      busy.current = false;
      if (isCurrent()) setOpening(false);
    }
  }, [overlays, showDialog, storeName]);

  return { storeName, isAvailable: Boolean(storeName), isOpening, openReview };
}
