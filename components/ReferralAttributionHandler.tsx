import { subscribeToChottuLinkReferrals } from '@/services/chottuLinkReferral';
import { useResolveReferralAttributionMutation } from '@/store/api/referralApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import {
  captureFirstReferralAttribution,
  getPendingReferralAttribution,
} from '@/utils/referralAttribution';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Capture les liens ChottuLink avant l'inscription.
 *
 * Le premier lien valide gagne. Un lien ouvert par un compte deja connecte
 * n'est jamais rattache retroactivement a ce compte.
 */
export function ReferralAttributionHandler() {
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [resolveReferralAttribution] = useResolveReferralAttributionMutation();
  const isProcessing = useRef(false);
  const isAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    return subscribeToChottuLinkReferrals((payload) => {
      if (isAuthenticatedRef.current || isProcessing.current) return;

      void (async () => {
        isProcessing.current = true;
        try {
          const existing = await getPendingReferralAttribution();
          if (existing) {
            router.replace({
              pathname: '/auth',
              params: { mode: 'signup', referralToken: existing.token },
            });
            return;
          }

          const resolved = await resolveReferralAttribution(
            payload.token,
          ).unwrap();
          const captured = await captureFirstReferralAttribution({
            token: payload.token,
            provider: 'chottulink',
            capturedAt: payload.capturedAt,
            referringLink: payload.referringLink,
            referrerFirstName: resolved.referrer.firstName,
          });
          if (!captured) return;

          router.replace({
            pathname: '/auth',
            params: { mode: 'signup', referralToken: captured.token },
          });
        } catch (error) {
          console.warn(
            "[ChottuLink] L'attribution de parrainage n'a pas pu etre validee:",
            error,
          );
        } finally {
          isProcessing.current = false;
        }
      })();
    });
  }, [resolveReferralAttribution, router]);

  return null;
}
