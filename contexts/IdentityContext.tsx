import { useDialog } from '@/components/ui/DialogProvider';
import { useGetKycStatusQuery } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
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
  refreshKycStatus: () => void;
  checkIdentity: (action?: IdentityAction, options?: { force?: boolean }) => boolean;
}

const IdentityContext = createContext<IdentityContextValue | undefined>(undefined);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { showDialog } = useDialog();
  const user = useAppSelector(selectUser);
  const {
    data: kycStatusData,
    isFetching,
    refetch,
  } = useGetKycStatusQuery(undefined, {
    skip: !user,
    // Pas de polling : le statut KYC change rarement (seulement après upload/validation)
    // RTK Query invalide automatiquement le cache via les tags après les mutations KYC
    refetchOnMountOrArgChange: true, // Refetch seulement au montage ou si les args changent
  });

  // Utiliser uniquement le statut KYC de l'API comme source de vérité
  // Ne pas se baser sur user?.status car cela peut être obsolète
  const isKycApproved = kycStatusData?.status === 'approved';
  const isIdentityVerified = Boolean(isKycApproved);

  const checkIdentity = useCallback(
    (action: IdentityAction = 'book', options?: { force?: boolean }) => {
      if (isIdentityVerified && !options?.force) {
        return true;
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
    [isIdentityVerified, router, showDialog],
  );

  const value = useMemo<IdentityContextValue>(
    () => ({
      isIdentityVerified,
      // Utiliser uniquement le statut KYC de l'API, pas user?.status
      kycStatus: kycStatusData?.status,
      kycDocument: kycStatusData,
      isChecking: isFetching,
      refreshKycStatus: refetch,
      checkIdentity,
    }),
    [
      checkIdentity,
      isFetching,
      isIdentityVerified,
      kycStatusData,
      refetch,
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

