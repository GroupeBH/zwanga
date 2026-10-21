import { getAuthErrorMessage } from './authModel';
import { getErrorMessageText, getErrorStatus } from '@/utils/errors/errorParsing';

/** A login failure is not an expired logged-in session. Keep transport errors distinct. */
export function passwordLoginError(error: unknown): string {
  const status = getErrorStatus(error);
  if (status === 429) return 'Trop de tentatives. Attendez un peu avant de réessayer.';
  if (typeof status === 'number' && status >= 500) return 'Connexion indisponible pour le moment. Réessayez dans un instant.';
  if (status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR') return 'Vérifiez votre connexion Internet, puis réessayez.';
  const raw = getErrorMessageText(error);
  if (/\bpin\b/i.test(raw) && /invalid|incorrect/i.test(raw)) return 'Mot de passe incorrect. Saisissez à nouveau vos quatre chiffres.';
  if (status === 401) return 'Vérifiez votre numéro et votre mot de passe à quatre chiffres.';
  return getAuthErrorMessage(error, 'Connexion impossible. Réessayez dans un instant.')
    .replace(/(?:code\s+)?\bPIN\b/gi, 'mot de passe à quatre chiffres');
}
