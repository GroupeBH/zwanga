import { useDialog } from '@/components/ui/DialogProvider';
import { useGetKycStatusQuery } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type { KycDocument } from '@/types';
import { useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

type IdentityAction = 'publish' | 'book' | 'manage';

interface IdentityContextValue {
  isIdentityVerified: boolean;
  kycStatus: KycDocument['status'] | undefined;
  kycDocument: KycDocument | null | undefined;
  isChecking: boolean;
  refreshKycStatus: () => void;
  checkIdentity: (action?: IdentityAction) => boolean;
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
    (action: IdentityAction = 'book') => {
      if (isIdentityVerified) {
        return true;
      }

      const actionText =
        action === 'publish'
          ? 'publier ou gérer vos trajets'
          : action === 'manage'
            ? 'gérer vos trajets'
            : 'réserver un trajet ou contacter un conducteur';

      showDialog({
        variant: 'warning',
        title: 'KYC requis',
        message: `Pour ${actionText}, vous devez finaliser la vérification de votre identité (CNI + selfie).`,
        actions: [
          { label: 'Plus tard', variant: 'ghost' },
          { label: 'Compléter maintenant', variant: 'primary', onPress: () => router.push('/profile') },
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

