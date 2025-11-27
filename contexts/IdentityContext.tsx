import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useGetKycStatusQuery } from '@/store/api/userApi';
import type { KycDocument } from '@/types';

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
  const user = useAppSelector(selectUser);
  const {
    data: kycStatusData,
    isFetching,
    refetch,
  } = useGetKycStatusQuery(undefined, {
    skip: !user,
    pollingInterval: 60_000,
  });

  const normalizedUserStatus = user?.status?.toLowerCase?.();
  const isKycApproved = kycStatusData?.status === 'approved';
  const isIdentityVerified = Boolean(
    isKycApproved || user?.identityVerified || normalizedUserStatus === 'active',
  );

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

      Alert.alert(
        'KYC requis',
        `Pour ${actionText}, vous devez finaliser la vérification de votre identité (CNI + selfie).`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Compléter maintenant',
            onPress: () => router.push('/profile'),
          },
        ],
      );

      return false;
    },
    [isIdentityVerified, router],
  );

  const value = useMemo<IdentityContextValue>(
    () => ({
      isIdentityVerified,
      kycStatus: kycStatusData?.status ?? (normalizedUserStatus as KycDocument['status'] | undefined),
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
      normalizedUserStatus,
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

