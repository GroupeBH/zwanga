import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import { useGetKycStatusQuery } from '@/store/api/userApi';
import { useEffect, useState } from 'react';

interface Params {
  isIdentityVerified: boolean;
}

export function usePublishIdentity({
  isIdentityVerified,
}: Params) {
  const [kycModalVisible, setKycModalVisible] = useState(false);
  const [kycApprovedInForm, setKycApprovedInForm] = useState(false);

  const { data: kycStatusData, refetch: refetchKycStatus } = useGetKycStatusQuery();
  const isPublishIdentityVerified =
    isIdentityVerified || kycApprovedInForm || kycStatusData?.status === 'approved';
  const { startDiditKyc, isStartingDiditKyc } = useDiditKycFlow({
    sourceScreen: 'publish',
    onStatusRefresh: refetchKycStatus,
    approvedMessage:
      "Votre identité a été vérifiée avec succès. Vous pouvez maintenant publier vos trajets.",
    pendingMessage:
      'Votre vérification Didit est en cours. Vous pourrez publier dès que le statut sera validé.',
  });

  useEffect(() => {
    if (kycStatusData?.status !== 'approved') {
      return;
    }

    setKycApprovedInForm(true);
    setKycModalVisible(false);
  }, [kycStatusData?.status]);

  const openKycModal = () => setKycModalVisible(true);
  const closeKycModal = () => {
    if (isStartingDiditKyc) {
      return;
    }
    setKycModalVisible(false);
  };

  const isKycBusy = isStartingDiditKyc;

  const kycChecklist = [
    { icon: 'shield-checkmark', title: 'Vérification sécurisée', subtitle: 'Votre identité et votre visage sont contrôlés' },
    { icon: 'id-card', title: "Pièce d'identité", subtitle: 'Présentez votre document original' },
    { icon: 'time', title: 'Suivi de la vérification', subtitle: 'Une notification après la décision' },
  ] as const;

  return {
    isPublishIdentityVerified,
    openKycModal,
    setKycModalVisible,
    startDiditKyc,
    setKycApprovedInForm,
    kycModalVisible,
    closeKycModal,
    kycChecklist,
    isKycBusy,
  };
}
