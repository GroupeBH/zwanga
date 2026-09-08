function getErrorMessageText(error: any): string {
  if (!error) return '';

  const message =
    typeof error === 'string'
      ? error
      : error?.data?.message ??
        error?.data?.error?.message ??
        error?.data?.error ??
        error?.error?.message ??
        error?.error ??
        error?.message ??
        '';

  return Array.isArray(message) ? message.join(' ') : String(message);
}

function getErrorStatus(error: any): number | string | undefined {
  const numericStatus = error?.data?.statusCode ?? error?.originalStatus;
  if (typeof numericStatus === 'number') {
    return numericStatus;
  }

  if (typeof numericStatus === 'string') {
    const parsedNumericStatus = Number.parseInt(numericStatus, 10);
    if (Number.isFinite(parsedNumericStatus)) {
      return parsedNumericStatus;
    }
  }

  const status = error?.status;
  if (typeof status === 'number') {
    return status;
  }

  if (typeof status === 'string') {
    const parsedStatus = Number.parseInt(status, 10);
    return Number.isFinite(parsedStatus) ? parsedStatus : status;
  }

  return undefined;
}

function normalizeMessage(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(normalizeMessage).filter(Boolean).join('\n');
  }

  if (typeof value === 'string') {
    return value.trim().replace(/[ \t]+/g, ' ');
  }

  if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown; error?: unknown };
    return normalizeMessage(candidate.message ?? candidate.error);
  }

  return '';
}

function getRawErrorMessage(error: any, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string') {
    return normalizeMessage(error);
  }

  return normalizeMessage(
    error?.data?.message ??
      error?.data?.error?.message ??
      error?.data?.error ??
      error?.error?.message ??
      error?.error ??
      error?.message ??
      fallback,
  );
}

function getStatusErrorMessage(status: number | string | undefined, fallback: string): string | null {
  if (status === 'FETCH_ERROR') {
    return 'Connexion impossible avec le serveur. V\u00e9rifiez votre connexion internet puis r\u00e9essayez.';
  }

  if (status === 'TIMEOUT_ERROR') {
    return 'La connexion est trop lente pour terminer cette action. R\u00e9essayez dans un instant.';
  }

  if (status === 'PARSING_ERROR') {
    return 'Le service a renvoy\u00e9 une r\u00e9ponse inattendue. R\u00e9essayez dans quelques instants.';
  }

  if (status === 'CUSTOM_ERROR') {
    return fallback;
  }

  if (typeof status !== 'number') {
    return null;
  }

  if (status === 400 || status === 422) {
    return 'Certaines informations sont incorrectes ou incompl\u00e8tes. V\u00e9rifiez le formulaire puis r\u00e9essayez.';
  }

  if (status === 401) {
    return 'Votre session a expir\u00e9. Reconnectez-vous puis r\u00e9essayez.';
  }

  if (status === 403) {
    return "Vous n'avez pas l'autorisation d'effectuer cette action.";
  }

  if (status === 404) {
    return "L'\u00e9l\u00e9ment demand\u00e9 est introuvable. Il a peut-\u00eatre \u00e9t\u00e9 supprim\u00e9 ou modifi\u00e9.";
  }

  if (status === 409) {
    return 'Cette action entre en conflit avec des informations d\u00e9j\u00e0 enregistr\u00e9es. V\u00e9rifiez puis r\u00e9essayez.';
  }

  if (status === 429) {
    return 'Trop de tentatives. Patientez quelques instants puis r\u00e9essayez.';
  }

  if (status >= 500) {
    return 'Le service rencontre un probl\u00e8me pour le moment. R\u00e9essayez dans quelques instants.';
  }

  return fallback || null;
}

function isProbablyFrenchMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return /[àâçéèêëîïôùûüÿœ]/i.test(message) ||
    /\b(impossible|veuillez|merci|votre|vous|trajet|demande|vehicule|v[eé]hicule|conducteur|chauffeur|passager|connexion|serveur|code|pin|compte|abonnement|requis|requise|r[eé]essayez|invalide|expir[eé]|saisissez|selectionnez|s[eé]lectionnez|annul[eé]|supprim[eé]|modifi[eé]|cr[eé][eé])\b/.test(normalized);
}

function isTechnicalOrEnglishMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    /(^|\b)(aborterror|aborted|cancelled|canceled|internal server error|server error|bad gateway|service unavailable|gateway timeout|network request failed|failed to fetch|load failed|timeout|timed out|request failed|status code|non-2xx|http error|fetch error|typeerror|syntaxerror|referenceerror|json parse|unexpected token|cannot read|undefined is not|null is not|econn|etimedout|enotfound|socket|ssl|tls|cors)(\b|$)/i.test(message)
  ) {
    return true;
  }

  if (/\b(unauthorized|forbidden|not found|invalid|required|already exists|must be|cannot|failed|error)\b/.test(normalized)) {
    return !isProbablyFrenchMessage(message);
  }

  return false;
}

function getTechnicalErrorMessage(rawMessage: string, status: number | string | undefined): string | null {
  const message = rawMessage.toLowerCase();

  if (/\b(aborterror|aborted|request aborted)\b/.test(message)) {
    return 'La connexion a \u00e9t\u00e9 interrompue avant la fin de l\u2019action. V\u00e9rifiez votre connexion puis r\u00e9essayez.';
  }

  if (/\b(cancelled|canceled)\b/.test(message)) {
    return 'L\u2019action a \u00e9t\u00e9 annul\u00e9e avant d\u2019\u00eatre termin\u00e9e. Vous pouvez r\u00e9essayer quand vous \u00eates pr\u00eat.';
  }

  if (/\b(timeout|timed out|etimedout|gateway timeout)\b/.test(message)) {
    return 'La connexion est trop lente pour terminer cette action. R\u00e9essayez dans un instant.';
  }

  if (
    /\b(network request failed|failed to fetch|fetch error|load failed|econn|enotfound|socket|ssl|tls|cors)\b/.test(message)
  ) {
    return 'Connexion impossible avec le serveur. V\u00e9rifiez votre connexion internet puis r\u00e9essayez.';
  }

  if (/\b(unauthorized|invalid token|jwt expired|token expired)\b/.test(message)) {
    return 'Votre session a expir\u00e9. Reconnectez-vous puis r\u00e9essayez.';
  }

  if (/\b(forbidden|permission denied|not allowed|access denied)\b/.test(message)) {
    return "Vous n'avez pas l'autorisation d'effectuer cette action.";
  }

  if (/\b(not found|does not exist)\b/.test(message)) {
    return "L'\u00e9l\u00e9ment demand\u00e9 est introuvable. Il a peut-\u00eatre \u00e9t\u00e9 supprim\u00e9 ou modifi\u00e9.";
  }

  if (/\b(already exists|duplicate|already registered|unique constraint)\b/.test(message)) {
    if (/\b(license plate|plate|plaque)\b/.test(message)) {
      return 'Cette plaque est d\u00e9j\u00e0 utilis\u00e9e. V\u00e9rifiez le num\u00e9ro ou utilisez une autre plaque.';
    }
    return 'Ces informations existent d\u00e9j\u00e0. V\u00e9rifiez puis r\u00e9essayez.';
  }

  if (/\b(date|departure date|departure time|start date|past)\b/.test(message)) {
    return 'Choisissez une date et une heure de d\u00e9part valides, puis r\u00e9essayez.';
  }

  if (/\b(seat|seats|available seats|total seats)\b/.test(message)) {
    return 'V\u00e9rifiez le nombre de places indiqu\u00e9 puis r\u00e9essayez.';
  }

  if (/\b(price|amount|budget|payment)\b/.test(message)) {
    return 'V\u00e9rifiez le montant ou le mode de paiement, puis r\u00e9essayez.';
  }

  if (/\b(required|must be|invalid|bad request|validation)\b/.test(message)) {
    return 'Certaines informations sont incorrectes ou incompl\u00e8tes. V\u00e9rifiez le formulaire puis r\u00e9essayez.';
  }

  if (/\b(json parse|unexpected token|syntaxerror)\b/.test(message)) {
    return 'Le service a renvoy\u00e9 une r\u00e9ponse inattendue. R\u00e9essayez dans quelques instants.';
  }

  const hasServerFailureMessage =
    /\b(internal server error|server error|bad gateway|service unavailable)\b/.test(message);
  const hasGenericHttpFailureMessage = /\b(http error|status code|non-2xx)\b/.test(message);
  if (
    (typeof status === 'number' && status >= 500) ||
    hasServerFailureMessage ||
    (typeof status !== 'number' && hasGenericHttpFailureMessage)
  ) {
    return 'Le service rencontre un probl\u00e8me pour le moment. R\u00e9essayez dans quelques instants.';
  }

  return null;
}

function getKnownBusinessErrorMessage(error: any): string | null {
  if (isDailyPublicationLimitError(error)) {
    return 'Vous avez atteint la limite de publication disponible. Passez \u00e0 Zwanga Pro pour publier plus de trajets.';
  }

  if (isDriverRequiredError(error)) {
    return 'Activez votre compte conducteur pour effectuer cette action.';
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
