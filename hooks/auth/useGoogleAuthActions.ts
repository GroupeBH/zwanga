import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { getAuthErrorMessage, isSocialSignupRequiredError, type SocialSignupSeed } from '@/features/auth/authModel';
import { normalizeGoogleAuthError } from '@/features/auth/googleAuthErrors';
import { signInWithGoogle, type GoogleAuthResult } from '@/services/googleAuth';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { trackEvent } from '@/services/analytics';
import type { SocialAuthParams } from './useSocialAuthActions';

type Props = Pick<SocialAuthParams, 'setGoogleFlow' | 'setSocialProvider' | 'setGoogleIdToken' |
  'setGoogleProfileName' | 'setGoogleFirstName' | 'setGoogleLastName' | 'setGoogleEmail' | 'googleMobile' | 'showDialog' | 'confirmSession'> & {
  attemptInFlight: MutableRefObject<boolean>;
  onSignupRequired: (seed: SocialSignupSeed) => void;
};

export function useGoogleAuthActions({ attemptInFlight, onSignupRequired, setGoogleFlow, setSocialProvider,
  setGoogleIdToken, setGoogleProfileName, setGoogleFirstName, setGoogleLastName, setGoogleEmail, googleMobile, showDialog, confirmSession }: Props) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const start = async (mode: 'login' | 'signup') => {
    // Synchronous lock covers SDK opening, account selection AND backend login.
    if (!mounted.current || attemptInFlight.current) return;
    attemptInFlight.current = true;
    setIsGoogleLoading(true);
    const session = getTokenSessionVersion();
    const canContinue = () => mounted.current && session === getTokenSessionVersion();
    let result: GoogleAuthResult | null = null;
    let awaitingRedirect = false;
    try {
      setGoogleFlow(mode);
      setSocialProvider('google');
      result = await signInWithGoogle();
      if (!canContinue()) return;
      setGoogleIdToken(result.idToken);
      setGoogleProfileName(result.name || result.email || 'Profil Google');
      setGoogleFirstName(result.givenName || null);
      setGoogleLastName(result.familyName || null);
      setGoogleEmail(result.email || null);
      if (mode === 'login') {
        const tokens = await googleMobile({ idToken: result.idToken }).unwrap();
        if (!canContinue()) return;
        await confirmSession(tokens);
        awaitingRedirect = true;
        // Analytics must not turn a successful login into an authentication error.
        void trackEvent('login_success', { method: 'google' }).catch(() => undefined);
      }
    } catch (error) {
      if (!canContinue()) return;
      if (result && mode === 'login' && isSocialSignupRequiredError(error, 'google')) {
        onSignupRequired({ provider: 'google', idToken: result.idToken,
          profileName: result.name || result.email || 'Profil Google', firstName: result.givenName,
          lastName: result.familyName, email: result.email });
        return;
      }
      const nativeError = result ? null : normalizeGoogleAuthError(error);
      if (nativeError?.kind !== 'cancelled') {
        // Only a bounded category is logged; never a token/profile or native debug text.
        console.warn('[GoogleAuth]', nativeError?.kind ?? 'backend_error');
        showDialog({ variant: nativeError?.kind === 'in_progress' ? 'info' : 'danger',
          title: mode === 'login' ? 'Connexion Google' : 'Inscription Google',
          message: nativeError?.message ?? getAuthErrorMessage(error, 'Connexion Google impossible. Réessayez dans quelques instants.'),
        });
      }
      setGoogleFlow(null);
      setSocialProvider(null);
      setGoogleIdToken(null);
    } finally {
      // Signup identity selection is only an intermediate step; it must unlock.
      if (!awaitingRedirect) {
        attemptInFlight.current = false;
        if (mounted.current) setIsGoogleLoading(false);
      }
    }
  };

  return { isGoogleLoading, handleGoogleLogin: () => start('login'), handleGoogleSignupStart: () => start('signup') };
}
