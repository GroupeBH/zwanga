export type GoogleAuthFailure = 'cancelled' | 'in_progress' | 'services_unavailable' |
  'configuration' | 'network' | 'missing_token' | 'unavailable';

const messages: Record<GoogleAuthFailure, string> = {
  cancelled: 'Connexion Google annulée.',
  in_progress: 'Google est encore occupé sur ce téléphone. Terminez ou fermez la fenêtre Google si elle est ouverte, puis réessayez dans quelques secondes. Vous pouvez aussi utiliser votre numéro de téléphone.',
  services_unavailable: 'Les services Google Play sont indisponibles ou doivent être mis à jour. Mettez-les à jour, puis réessayez, ou utilisez votre numéro de téléphone.',
  configuration: 'La connexion Google est indisponible sur cette version de l’application. Utilisez votre numéro de téléphone et contactez le support si le problème persiste.',
  network: 'Impossible de joindre Google. Vérifiez votre connexion internet, puis réessayez.',
  missing_token: 'Google n’a pas pu confirmer votre connexion. Réessayez ou utilisez votre numéro de téléphone.',
  unavailable: 'La connexion Google n’a pas pu démarrer. Réessayez dans quelques instants ou utilisez votre numéro de téléphone.',
};

export class GoogleAuthError extends Error {
  constructor(public readonly kind: GoogleAuthFailure) {
    super(messages[kind]);
    this.name = 'GoogleAuthError';
  }
}

/** Native debug text is never a user-facing message, regardless of its language. */
export function normalizeGoogleAuthError(error: unknown, codes: {
  IN_PROGRESS?: string; SIGN_IN_CANCELLED?: string; PLAY_SERVICES_NOT_AVAILABLE?: string;
} = {}): GoogleAuthError {
  if (error instanceof GoogleAuthError) return error;
  const value = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
  const code = String(value.code ?? '').toUpperCase();
  const message = (typeof error === 'string' ? error : typeof value.message === 'string' ? value.message : '').toLowerCase();
  const matches = (sdkCode?: string) => sdkCode !== undefined && code === String(sdkCode).toUpperCase();
  if (matches(codes.IN_PROGRESS) || ['ASYNC_OP_IN_PROGRESS', 'IN_PROGRESS', 'SIGN_IN_CURRENTLY_IN_PROGRESS', '12502'].includes(code) ||
    /\bin[ _-]progress\b|sign_in_currently_in_progress/.test(message)) return new GoogleAuthError('in_progress');
  if (matches(codes.SIGN_IN_CANCELLED) || ['SIGN_IN_CANCELLED', '12501', '-5'].includes(code)) return new GoogleAuthError('cancelled');
  if (matches(codes.PLAY_SERVICES_NOT_AVAILABLE) || code === 'PLAY_SERVICES_NOT_AVAILABLE') return new GoogleAuthError('services_unavailable');
  if (['10', 'DEVELOPER_ERROR'].includes(code) || /developer_error/.test(message)) return new GoogleAuthError('configuration');
  if (['7', 'NETWORK_ERROR'].includes(code) || /network|timed out|timeout|connexion internet/.test(message)) return new GoogleAuthError('network');
  return new GoogleAuthError('unavailable');
}
