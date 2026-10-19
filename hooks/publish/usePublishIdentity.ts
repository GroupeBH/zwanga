import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useEffect, useState } from 'react';

export function usePublishIdentity() {
  const identity = useIdentityCheck();
  const [kycModalVisible, setKycModalVisible] = useState(false);
  const isPublishIdentityVerified = identity.isIdentityVerified;
  const { startDiditKyc: launchDiditKyc, isStartingDiditKyc } = useDiditKycFlow({
    sourceScreen: 'publish',
    onStatusRefresh: identity.refreshKycStatus,
    approvedMessage:
      "Votre identité a été vérifiée avec succès. Vous pouvez maintenant publier vos trajets.",
    pendingMessage:
      'Votre vérification Didit est en cours. Vous pourrez publier dès que le statut sera validé.',
  });

  useEffect(() => {
    if (!isPublishIdentityVerified) {
      return;
    }

    setKycModalVisible(false);
  }, [isPublishIdentityVerified]);

  const awaitingStatus = identity.isChecking || !identity.isIdentityStatusKnown || identity.hasIdentityReadError;
  const openKycModal = () => {
    if (isPublishIdentityVerified) return;
    if (awaitingStatus) { identity.checkIdentity('publish'); return; }
    setKycModalVisible(true);
  };
  const startDiditKyc = () => {
    if (isPublishIdentityVerified) return Promise.resolve(null);
    if (awaitingStatus) { identity.checkIdentity('publish'); return Promise.resolve(null); }
    return launchDiditKyc();
  };
  const closeKycModal = () => {
    if (isStartingDiditKyc) {
      return;
    }
    setKycModalVisible(false);
  };

  const isKycBusy = isStartingDiditKyc;

  const kycChecklist = [
    { icon: 'shield-checkmark', title: 'Didit sécurisé', subtitle: 'Vérification hébergée par Didit' },
    { icon: 'id-card', title: "Pièce d'identité", subtitle: 'Contrôle guidé depuis le parcours Didit' },
    { icon: 'time', title: 'Validation rapide', subtitle: 'Suivi automatique de votre vérification' },
  ] as const;

  return {
    isPublishIdentityVerified,
    openKycModal,
    setKycModalVisible,
    startDiditKyc,
    isCheckingIdentity: identity.isChecking,
    isIdentityStatusKnown: identity.isIdentityStatusKnown,
    hasIdentityReadError: identity.hasIdentityReadError,
    refreshIdentity: identity.refreshKycStatus,
    kycModalVisible: kycModalVisible && !isPublishIdentityVerified && !awaitingStatus,
    closeKycModal,
    kycChecklist,
    isKycBusy,
  };
}
