import { RateTargetType } from '../../features/rating/ratingTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useCreateReviewMutation } from '@/store/api/reviewApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React from 'react';
import { Keyboard } from 'react-native';
import type { Trip } from '@/types';

interface Params {
  selectedTags: string[];
  setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  submitInFlightRef: React.RefObject<boolean>;
  isSubmittingReview: boolean;
  setSubmitSuccessMessage: React.Dispatch<React.SetStateAction<string | null>>;
  rating: number;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  trip: Trip | undefined;
  tripId: string;
  rateTargetType: RateTargetType;
  selectedPassenger: string | null;
  passengers: { id: string; name: string; seats: number; }[];
  comment: string;
  createReview: ReturnType<typeof useCreateReviewMutation>[0];
  isMountedRef: React.RefObject<boolean>;
  successReturnTimeoutRef: React.RefObject<NodeJS.Timeout | null>;
  goBackSafely: () => void;
  reportReason: string;
}

export function useRatingActions({
  selectedTags,
  setSelectedTags,
  submitInFlightRef,
  isSubmittingReview,
  setSubmitSuccessMessage,
  rating,
  showDialog,
  trip,
  tripId,
  rateTargetType,
  selectedPassenger,
  passengers,
  comment,
  createReview,
  isMountedRef,
  successReturnTimeoutRef,
  goBackSafely,
  reportReason,
}: Params) {
  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter(t => t !== tagId));
    } else {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  const handleSubmitRating = async () => {
    if (submitInFlightRef.current || isSubmittingReview) {
      return;
    }

    setSubmitSuccessMessage(null);

    if (rating === 0) {
      showDialog({
        variant: 'warning',
        title: 'Note requise',
        message: 'Veuillez sélectionner une note avant de soumettre votre avis.',
      });
      return;
    }

    if (!trip || !tripId) {
      showDialog({
        variant: 'danger',
        title: 'Trajet introuvable',
        message: 'Impossible de charger les informations du trajet.',
      });
      return;
    }

    // Déterminer l'utilisateur cible selon le type de notation
    let targetUserId: string | null = null;
    if (rateTargetType === 'driver') {
      targetUserId = trip.driverId;
    } else {
      // Pour les passagers, s'assurer qu'un passager est sélectionné
      if (!selectedPassenger) {
        showDialog({
          variant: 'warning',
          title: 'Passager requis',
          message: 'Sélectionnez le passager que vous souhaitez évaluer.',
        });
        return;
      }
      // Vérifier que le passager sélectionné existe dans la liste
      const selectedPassengerExists = passengers.some(p => p.id === selectedPassenger);
      if (!selectedPassengerExists) {
        showDialog({
          variant: 'warning',
          title: 'Passager invalide',
          message: 'Le passager sélectionné n\'est plus disponible. Veuillez en sélectionner un autre.',
        });
        return;
      }
      targetUserId = selectedPassenger;
    }

    if (!targetUserId) {
      showDialog({
        variant: 'warning',
        title: 'Sélection requise',
        message: rateTargetType === 'driver' 
          ? 'Impossible de trouver le conducteur.'
          : 'Sélectionnez la personne que vous souhaitez évaluer.',
      });
      return;
    }

    submitInFlightRef.current = true;
    try {
      const tagsSummary =
        selectedTags.length > 0 ? `\n\nTags: ${selectedTags.map((tag) => `#${tag}`).join(' ')}` : '';
      const reviewComment = `${comment.trim()}${tagsSummary}`.trim();
      await createReview({
        tripId,
        ratedUserId: targetUserId,
        rating,
        ...(reviewComment ? { comment: reviewComment } : {}),
      }).unwrap();

      if (!isMountedRef.current) {
        return;
      }

      Keyboard.dismiss();
      setSubmitSuccessMessage('Évaluation envoyée. Merci pour votre retour.');
      successReturnTimeoutRef.current = setTimeout(() => {
        successReturnTimeoutRef.current = null;
        if (isMountedRef.current) {
          goBackSafely();
        }
      }, 650);
    } catch (error: any) {
      submitInFlightRef.current = false;
      if (!isMountedRef.current) {
        return;
      }

      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible de soumettre votre avis pour le moment.'),
      });
    }
  };

  const handleSubmitReport = () => {
    if (!reportReason) {
      showDialog({
        variant: 'warning',
        title: 'Raison requise',
        message: 'Veuillez sélectionner une raison avant de signaler ce trajet.',
      });
      return;
    }

    showDialog({
      variant: 'info',
      title: 'Signalement envoyé',
      message:
        'Nous examinerons votre signalement. Merci pour votre contribution à la sécurité de la communauté.',
      actions: [{ label: 'Fermer', variant: 'primary', onPress: goBackSafely }],
    });
  };

  const getRatingText = () => {
    if (rating === 5) return 'Excellent !';
    if (rating === 4) return 'Très bien';
    if (rating === 3) return 'Bien';
    if (rating === 2) return 'Moyen';
    return 'Mauvais';
  };

  return {
    getRatingText,
    toggleTag,
    handleSubmitRating,
    handleSubmitReport,
  };
}
