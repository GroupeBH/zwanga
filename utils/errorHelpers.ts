/**
 * Détecte si une erreur est liée au fait qu'un utilisateur n'est pas conducteur
 */
export function isDriverRequiredError(error: any): boolean {
  if (!error) return false;

  const message = typeof error === 'string' 
    ? error 
    : error?.data?.message ?? error?.error ?? error?.message ?? '';

  if (typeof message !== 'string') return false;

  const lowerMessage = message.toLowerCase();
  
  // Mots-clés qui indiquent que l'utilisateur doit être conducteur
  const driverKeywords = [
    'driver',
    'conducteur',
    'chauffeur',
    'not a driver',
    'n\'est pas conducteur',
    'n\'êtes pas conducteur',
    'devenir conducteur',
    'driver required',
    'conducteur requis',
    'driver account',
    'compte conducteur',
    'passenger',
    'passager',
    'only drivers',
    'seulement les conducteurs',
  ];

  return driverKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Crée une action de redirection vers le profil pour devenir conducteur
 */
export function getApiErrorMessage(error: any, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (error.status === 429) {
    return 'Trop de tentatives. Patientez quelques instants puis réessayez.';
  }

  if (error.status === 'FETCH_ERROR') {
    return 'Connexion impossible avec le serveur. Vérifiez votre connexion internet puis réessayez.';
  }

  if (error.status === 'TIMEOUT_ERROR') {
    return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
  }

  const rawMessage =
    error?.data?.message ??
    error?.data?.error ??
    error?.error ??
    error?.message ??
    fallback;

  if (Array.isArray(rawMessage)) {
    return rawMessage.join('\n');
  }

  return String(rawMessage || fallback);
}

export function createBecomeDriverAction(router: any) {
  return {
    label: 'Devenir conducteur',
    variant: 'primary' as const,
    onPress: () =>
      router.push({
        pathname: '/profile',
        params: { openDriverOnboarding: '1' },
      } as any),
  };
}

