function getErrorMessageText(error: any): string {
  if (!error) return '';

  const message =
    typeof error === 'string'
      ? error
      : error?.data?.message ?? error?.data?.error ?? error?.error ?? error?.message ?? '';

  return Array.isArray(message) ? message.join(' ') : String(message);
}

/**
 * Detecte si l'erreur correspond au quota gratuit de publications atteint.
 */
export function isDailyPublicationLimitError(error: any): boolean {
  const message = getErrorMessageText(error);
  const normalized = message.toLowerCase();
  const mentionsPublication =
    normalized.includes('trajet') ||
    normalized.includes('publication') ||
    normalized.includes('publier');
  const mentionsSubscription =
    normalized.includes('abonnement') ||
    normalized.includes('forfait') ||
    normalized.includes('quota') ||
    normalized.includes('premium') ||
    normalized.includes('zwanga pro');

  return (
    normalized.includes('5 trajets') ||
    normalized.includes('cinq trajets') ||
    normalized.includes('forfait gratuit') ||
    normalized.includes('quota gratuit') ||
    normalized.includes('trajets inclus') ||
    normalized.includes('trajets disponibles') ||
    normalized.includes('trajets par jour') ||
    normalized.includes('trajets/jour') ||
    normalized.includes('limite gratuite') ||
    (normalized.includes('limite') && normalized.includes('jour')) ||
    (normalized.includes('utilis') &&
      normalized.includes('trajet') &&
      (normalized.includes('jour') ||
        normalized.includes('journ\u00e9e') ||
        normalized.includes("aujourd'hui") ||
        normalized.includes('disponible'))) ||
    (normalized.includes('atteint') &&
      normalized.includes('trajet') &&
      (normalized.includes('jour') ||
        normalized.includes('journ\u00e9e') ||
        normalized.includes('quota') ||
        normalized.includes('limite'))) ||
    (normalized.includes('daily') && normalized.includes('limit')) ||
    (mentionsSubscription && mentionsPublication)
  );
}

/**
 * Detecte si une erreur est liee au fait qu'un utilisateur n'est pas conducteur.
 */
export function isDriverRequiredError(error: any): boolean {
  const message = getErrorMessageText(error);
  if (!message || isDailyPublicationLimitError(error)) return false;

  const lowerMessage = message.toLowerCase();

  const driverKeywords = [
    'driver',
    'conducteur',
    'chauffeur',
    'not a driver',
    "n'est pas conducteur",
    "n'\u00eates pas conducteur",
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

export function getApiErrorMessage(error: any, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (error.status === 429) {
    return 'Trop de tentatives. Patientez quelques instants puis r\u00e9essayez.';
  }

  if (error.status === 'FETCH_ERROR') {
    return 'Connexion impossible avec le serveur. V\u00e9rifiez votre connexion internet puis r\u00e9essayez.';
  }

  if (error.status === 'TIMEOUT_ERROR') {
    return 'Le serveur met trop de temps \u00e0 r\u00e9pondre. R\u00e9essayez dans un instant.';
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

export function createSubscribeToZwangaProAction(router: any) {
  return {
    label: "S'abonner \u00e0 Zwanga Pro",
    variant: 'primary' as const,
    onPress: () => router.push({ pathname: '/subscriptions/payment' } as any),
  };
}
