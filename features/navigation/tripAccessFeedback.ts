/** Never turn a failed permission check into permission to manage a trip. */
export function tripAccessFeedback(error: unknown, hasTrip: boolean) {
  const status = (error as { status?: number | string } | undefined)?.status;
  if (status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR') return {
    title: 'Connexion au trajet interrompue',
    message: 'Vérifiez votre connexion internet, puis réessayez pour retrouver votre trajet.', retry: true,
  };
  if (Number(status) === 404) return {
    title: 'Trajet introuvable', message: 'Ce trajet n’est plus disponible. Revenez à l’accueil.', retry: false,
  };
  if (Number(status) === 401) return {
    title: 'Connexion au compte nécessaire', message: 'Reconnectez-vous pour accéder à votre trajet.', retry: false,
  };
  if (Number(status) === 403 || hasTrip) return {
    title: 'Accès réservé au conducteur',
    message: 'Seul le conducteur qui a publié ce trajet peut le gérer. Retrouvez vos réservations dans Mes trajets.', retry: false,
  };
  return { title: 'Trajet temporairement indisponible',
    message: 'Impossible de vérifier ce trajet pour le moment. Réessayez dans quelques instants.', retry: Boolean(error) };
}
