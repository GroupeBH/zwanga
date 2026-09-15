import { getStatusErrorMessage, isTechnicalOrEnglishMessage, getTechnicalErrorMessage } from './errors/errorPresentation';
import { getErrorMessageText, getErrorStatus, getRawErrorMessage } from './errors/errorParsing';
export { getErrorStatus } from './errors/errorParsing';
import { EXTRA_SEATS_IDENTITY_MESSAGE } from '@/utils/passengerSeats';

function getKnownBusinessErrorMessage(error: any): string | null {
  const code = error?.data?.code ?? error?.data?.error?.code ?? error?.error?.code ?? error?.code;
  if (code === 'TRIP_REQUEST_PRICE_LOCKED') {
    return 'Le prix de ce trajet a déjà été validé par le passager et ne peut plus être modifié.';
  }

  if (isDailyPublicationLimitError(error)) {
    return 'Vous avez atteint la limite de publication disponible. Passez \u00e0 Zwanga Pro pour publier plus de trajets.';
  }

  if (isDriverRequiredError(error)) {
    return 'Activez votre compte conducteur pour effectuer cette action.';
  }

  if (isPassengerKycRequiredError(error)) {
    if (isExtraSeatsIdentityError(error)) return EXTRA_SEATS_IDENTITY_MESSAGE;
    return "Ce trajet exige une vérification d'identité approuvée du passager avant de continuer.";
  }

  const message = getErrorMessageText(error).toLowerCase();

  if (message.includes('otp') || message.includes('one-time password')) {
    return 'Le code de v\u00e9rification est invalide ou expir\u00e9.';
  }

  if (message.includes('pin') && (message.includes('invalid') || message.includes('incorrect'))) {
    return 'Le PIN saisi est incorrect.';
  }

  if (message.includes('phone') && (message.includes('invalid') || message.includes('required'))) {
    return 'Le num\u00e9ro de t\u00e9l\u00e9phone est invalide ou incomplet.';
  }

  if (message.includes('vehicle') && message.includes('not found')) {
    return 'Ce v\u00e9hicule est introuvable. Actualisez la page puis r\u00e9essayez.';
  }

  if (message.includes('trip') && message.includes('not found')) {
    return 'Ce trajet est introuvable. Il a peut-\u00eatre \u00e9t\u00e9 supprim\u00e9 ou modifi\u00e9.';
  }

  return null;
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

  const code = String(
    error?.data?.code ??
      error?.data?.error?.code ??
      error?.error?.code ??
      error?.code ??
      '',
  ).toUpperCase();
  if (
    [
      'DRIVER_REQUIRED',
      'DRIVER_PROFILE_REQUIRED',
      'DRIVER_ACCOUNT_REQUIRED',
      'USER_NOT_DRIVER',
    ].includes(code)
  ) {
    return true;
  }

  const lowerMessage = message.toLowerCase();

  const driverKeywords = [
    'not a driver',
    "n'est pas conducteur",
    "n'est pas un conducteur",
    "n'\u00eates pas conducteur",
    "n'\u00eates pas un conducteur",
    'devenir conducteur',
    'driver required',
    'driver profile required',
    'profil conducteur requis',
    'must be a driver',
    'vous devez être conducteur',
    'vous devez etre conducteur',
    'only drivers',
    'seulement les conducteurs',
    'seuls les conducteurs',
  ];

  return driverKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Detecte si une action est bloquee parce que le passager n'a pas encore
 * un KYC approuve alors que le conducteur l'exige pour ce trajet.
 */
export function isExtraSeatsIdentityError(error: any): boolean {
  return (error?.data?.reason ?? error?.reason) === 'extra_seats';
}

export function isPassengerKycRequiredError(error: any): boolean {
  const code = String(
    error?.data?.code ??
      error?.data?.error?.code ??
      error?.error?.code ??
      error?.code ??
      '',
  ).toUpperCase();

  if (code === 'PASSENGER_KYC_REQUIRED') {
    return true;
  }

  const message = getErrorMessageText(error).toLowerCase();
  return (
    message.includes('passenger_kyc_required') ||
    message.includes('passenger kyc') ||
    message.includes('kyc passager') ||
    (message.includes('passager') &&
      message.includes('kyc') &&
      (message.includes('requis') || message.includes('required')))
  );
}

/**
 * A transport failure does not prove that a mutation failed. The server may
 * have committed the change after the client stopped waiting for the reply.
 */
export function isAmbiguousTransportError(error: any): boolean {
  const status = getErrorStatus(error);
  if (status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR') {
    return true;
  }

  const message = getRawErrorMessage(error, '').toLowerCase();
  return /\b(aborterror|aborted|request aborted|network request failed|failed to fetch|load failed|timed out|timeout|etimedout)\b/.test(
    message,
  );
}

export function getApiErrorMessage(error: any, fallback: string): string {
  if (!error) {
    return fallback;
  }

  const knownMessage = getKnownBusinessErrorMessage(error);
  if (knownMessage) {
    return knownMessage;
  }

  const status = getErrorStatus(error);
  const rawMessage = getRawErrorMessage(error, fallback);
  const technicalMessage = getTechnicalErrorMessage(rawMessage, status);

  if (technicalMessage) {
    return technicalMessage;
  }

  if (!rawMessage || isTechnicalOrEnglishMessage(rawMessage)) {
    return getStatusErrorMessage(status, fallback) ?? fallback;
  }

  return rawMessage;
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
