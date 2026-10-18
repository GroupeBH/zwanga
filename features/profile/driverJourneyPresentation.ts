import type { ProfileState } from '@/types';

export function getDriverJourneyPresentation(state: ProfileState) {
  const action = state.driver.nextAction;
  const views = {
    start: { title: 'Devenir conducteur', message: 'Vérifiez votre identité et ajoutez un véhicule pour proposer vos trajets.', label: 'Commencer' },
    verify_identity: { title: 'Vérifiez votre identité', message: state.identity.status === 'rejected'
      ? state.identity.rejectionReason || 'Votre vérification doit être reprise.'
      : 'Une vérification sécurisée est nécessaire pour proposer vos trajets.', label: state.identity.status === 'rejected' ? 'Reprendre la vérification' : 'Vérifier mon identité' },
    add_vehicle: { title: 'Ajoutez votre véhicule', message: state.identity.status === 'pending'
      ? 'Votre identité est en cours de vérification. Ajoutez votre véhicule pendant ce temps.'
      : 'Votre identité est validée. Ajoutez un véhicule actif pour continuer.', label: 'Ajouter un véhicule' },
    wait: { title: 'Vérification en cours', message: 'Vos informations sont en cours d’examen. Aucun nouveau document à envoyer.', label: 'Actualiser mon statut' },
    activate: { title: 'Tout est prêt', message: 'Votre identité et votre véhicule sont validés. Finalisez votre profil conducteur.', label: 'Activer mon profil conducteur' },
    none: { title: 'Profil conducteur actif', message: 'Vous pouvez proposer vos trajets.', label: 'Continuer' },
    contact_support: { title: 'Compte limité', message: 'Contactez le support pour connaître les prochaines étapes.', label: 'Contacter le support' },
  };
  return { ...views[action], showSteps: action !== 'start' && action !== 'contact_support',
    identityLabel: state.identity.status === 'approved' ? 'Identité validée' : state.identity.status === 'pending' ? 'Identité en cours de vérification' : 'Identité à vérifier',
    vehicleLabel: state.driver.activeVehicleCount > 0 ? 'Véhicule actif ajouté' : 'Véhicule à ajouter' };
}
