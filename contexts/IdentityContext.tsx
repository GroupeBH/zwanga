import { useDialog } from '@/components/ui/DialogProvider';
import { useAccountIdentityStatus } from '@/hooks/identity/useAccountIdentityStatus';
import type { KycDocument } from '@/types';
import { EXTRA_SEATS_IDENTITY_MESSAGE } from '@/utils/passengerSeats';
import { useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

type IdentityAction = 'publish' | 'book' | 'manage' | 'request' | 'extra_seats';

const getIdentityRequirementCopy = (action: IdentityAction) => {
  switch (action) {
    case 'extra_seats':
      return { actionText: 'réserver 3 places ou plus', message: EXTRA_SEATS_IDENTITY_MESSAGE };
    case 'publish':
      return {
        actionText: 'publier ou gérer vos trajets',
        message:
          "Pour publier ou gérer vos trajets, vous devez d'abord vérifier votre identité avec une pièce officielle et un selfie.",
      };
    case 'request':
      return {
        actionText: 'demander un trajet',
        message:
          "Pour demander ce trajet, vous devez vérifier votre identité. Cette vérification concerne votre profil passager : aucun véhicule n'est demandé.",
      };
    case 'manage':
      return {
        actionText: 'gérer vos trajets',
        message:
          "Pour gérer vos trajets, vous devez d'abord vérifier votre identité avec une pièce officielle et un selfie.",
      };
    case 'book':
    default:
      return {
        actionText: 'réserver ce trajet ou contacter le conducteur',
        message:
          "Ce trajet accepte uniquement les passagers dont l'identité est vérifiée. Vous pouvez vérifier votre identité comme passager, sans ajouter de véhicule.",
      };
  }
};

interface IdentityContextValue {
  isIdentityVerified: boolean;
  kycStatus: KycDocument['status'] | undefined;
  kycDocument: KycDocument | null | undefined;
  isChecking: boolean;
  isIdentityStatusKnown: boolean;
  hasIdentityReadError: boolean;
  refreshKycStatus: () => Promise<void>;
  checkIdentity: (action?: IdentityAction, options?: { force?: boolean }) => boolean;
}

const IdentityContext = createContext<IdentityContextValue | undefined>(undefined);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { showDialog } = useDialog();
  const identity = useAccountIdentityStatus();
  const { isIdentityVerified, isChecking, isIdentityStatusKnown, hasIdentityReadError, refreshKycStatus } = identity;

  const checkIdentity = useCallback(
    (action: IdentityAction = 'book', options?: { force?: boolean }) => {
      if (isIdentityVerified && !options?.force) {
        return true;
      }

      if (isChecking || !isIdentityStatusKnown || hasIdentityReadError) {
        showDialog({ variant: 'info',
          title: isChecking ? 'Mise à jour de votre profil' : 'Statut indisponible',
          message: isChecking ? 'Nous vérifions votre validation. Patientez un instant, puis continuez.'
            : 'Impossible de vérifier votre validation. Vérifiez votre connexion puis réessayez. Ne recommencez pas votre vérification d’identité.',
          actions: isChecking ? undefined : [{ label: 'Réessayer', onPress: refreshKycStatus }],
        });
        return false;
      }

      const { actionText, message } = getIdentityRequirementCopy(action);

      showDialog({
        variant: 'warning',
        title: 'Identité vérifiée requise',
        message,
        actions: [
          { label: 'Plus tard', variant: 'ghost' },
          {
            label: 'Vérifier mon identité',
            variant: 'primary',
            onPress: () =>
              router.push({
                pathname: '/verification',
                params: { source: action, reason: actionText },
              } as any),
          },
        ],
      });

      return false;
    },
    [isIdentityVerified, isChecking, isIdentityStatusKnown, hasIdentityReadError, refreshKycStatus, router, showDialog],
  );

  const value = useMemo<IdentityContextValue>(
    () => ({
      ...identity,
      checkIdentity,
    }),
    [
      checkIdentity,
      identity,
    ],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentityContext() {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentityContext must be used within an IdentityProvider');
  }

  return context;
}

