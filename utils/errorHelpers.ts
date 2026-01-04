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
export function createBecomeDriverAction(router: any) {
  return {
    label: 'Devenir conducteur',
    variant: 'primary' as const,
    onPress: () => router.push('/profile'),
  };
}

