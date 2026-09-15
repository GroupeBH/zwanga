

export function getStatusErrorMessage(status: number | string | undefined, fallback: string): string | null {
  if (status === 'FETCH_ERROR') {
    return 'La connexion a \u00e9t\u00e9 interrompue. V\u00e9rifiez votre connexion puis actualisez l\u2019\u00e9cran pour confirmer le r\u00e9sultat.';
  }

  if (status === 'TIMEOUT_ERROR') {
    return 'La connexion a \u00e9t\u00e9 trop lente. Actualisez l\u2019\u00e9cran pour v\u00e9rifier si l\u2019action a bien \u00e9t\u00e9 prise en compte.';
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

export function isProbablyFrenchMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return /[àâçéèêëîïôùûüÿœ]/i.test(message) ||
    /\b(impossible|veuillez|merci|votre|vous|trajet|demande|vehicule|v[eé]hicule|conducteur|chauffeur|passager|connexion|serveur|code|pin|compte|abonnement|requis|requise|r[eé]essayez|invalide|expir[eé]|saisissez|selectionnez|s[eé]lectionnez|annul[eé]|supprim[eé]|modifi[eé]|cr[eé][eé])\b/.test(normalized);
}

export function isTechnicalOrEnglishMessage(message: string): boolean {
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

export function getTechnicalErrorMessage(rawMessage: string, status: number | string | undefined): string | null {
  const message = rawMessage.toLowerCase();

  if (/\b(aborterror|aborted|request aborted)\b/.test(message)) {
    return 'La connexion a \u00e9t\u00e9 interrompue. Actualisez l\u2019\u00e9cran pour v\u00e9rifier si l\u2019action a bien \u00e9t\u00e9 prise en compte.';
  }

  if (/\b(cancelled|canceled)\b/.test(message)) {
    return 'L\u2019action a \u00e9t\u00e9 annul\u00e9e avant d\u2019\u00eatre termin\u00e9e. Vous pouvez r\u00e9essayer quand vous \u00eates pr\u00eat.';
  }

  if (/\b(timeout|timed out|etimedout|gateway timeout)\b/.test(message)) {
    return 'La connexion a \u00e9t\u00e9 trop lente. Actualisez l\u2019\u00e9cran pour v\u00e9rifier si l\u2019action a bien \u00e9t\u00e9 prise en compte.';
  }

  if (
    /\b(network request failed|failed to fetch|fetch error|load failed|econn|enotfound|socket|ssl|tls|cors)\b/.test(message)
  ) {
    return 'La connexion a \u00e9t\u00e9 interrompue. V\u00e9rifiez votre connexion puis actualisez l\u2019\u00e9cran pour confirmer le r\u00e9sultat.';
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

  if (
    /\b(required|must be|invalid|bad request)\b/.test(message) ||
    /\b(validation error|validation failed|validationexception)\b/.test(message)
  ) {
    return 'Certaines informations sont incorrectes ou incompl\u00e8tes. V\u00e9rifiez le formulaire puis r\u00e9essayez.';
  }

  return null;
}
