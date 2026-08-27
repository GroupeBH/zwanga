import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import {
  subscribeToChottuLinkReferrals,
  type ChottuLinkReferralPayload,
} from '@/services/chottuLinkReferral';
import {
  useAttachMyReferralAttributionMutation,
  useResolveReferralAttributionMutation,
} from '@/store/api/referralApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import {
  captureFirstReferralAttribution,
  consumePendingReferralAttribution,
  getPendingReferralAttribution,
  type PendingReferralAttribution,
} from '@/utils/referralAttribution';
import {
  getReferralErrorStatus,
  isDefinitiveAuthenticatedAttributionError,
  isDuplicateReferralEvent,
  shouldNavigateToReferralAuth,
} from '@/utils/referralAttributionPolicy';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Captures ChottuLink referrals for both new and existing accounts.
 *
 * The first valid attribution wins locally. If a session already exists (or
 * becomes available after login), the server attaches the account only when it
 * has no referrer. The server remains the authority for immutability.
 */
export function ReferralAttributionHandler() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [resolveReferralAttribution] = useResolveReferralAttributionMutation();
  const [attachMyReferralAttribution] =
    useAttachMyReferralAttributionMutation();
  const isProcessing = useRef(false);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const lastProcessedEventRef = useRef<{ token: string; processedAt: number } | null>(null);
  const lastRetryNoticeTokenRef = useRef<string | null>(null);

  // Keep this synchronized during render so a deep-link callback can never use
  // the authentication value from the previous render and navigate to /auth.
  isAuthenticatedRef.current = isAuthenticated;

  const attachPendingAttribution = useCallback(
    async (pending: PendingReferralAttribution) => {
      if (!isAuthenticatedRef.current || isProcessing.current) return;
      isProcessing.current = true;
      try {
        const result = await attachMyReferralAttribution({
          referralToken: pending.token,
          referralProvider: pending.provider,
          referralReferringLink: pending.referringLink,
          referralCapturedAt: pending.capturedAt,
        }).unwrap();
        await consumePendingReferralAttribution(pending.token);
        lastRetryNoticeTokenRef.current = null;
        await trackEvent('referral_attribution_attached', {
          newly_attached: result.newlyAttached,
          source: pending.isDeferred ? 'deferred' : 'direct',
        });
        showDialog({
          variant: 'success',
          title: result.newlyAttached
            ? 'Invitation prise en compte'
            : 'Parrainage déjà enregistré',
          message: result.newlyAttached
            ? `Votre compte est maintenant rattaché à ${result.referrer.firstName}.`
            : `Votre compte est déjà rattaché à ${result.referrer.firstName}.`,
        });
      } catch (error) {
        await trackEvent('referral_attribution_failed', {
          status: getReferralErrorStatus(error) ?? 'network',
          phase: 'authenticated_attachment',
        });
        if (isDefinitiveAuthenticatedAttributionError(error)) {
          await consumePendingReferralAttribution(pending.token);
          lastRetryNoticeTokenRef.current = null;
          showDialog({
            variant: 'warning',
            title: 'Invitation non appliquée',
            message: getApiErrorMessage(
              error,
              'Ce compte possède déjà un parrain ou cette invitation ne peut plus être utilisée.',
            ),
          });
        } else {
          if (lastRetryNoticeTokenRef.current !== pending.token) {
            lastRetryNoticeTokenRef.current = pending.token;
            showDialog({
              variant: 'info',
              title: 'Invitation conservée',
              message:
                "Zwanga n'a pas encore pu enregistrer votre parrain. Votre session reste ouverte et une nouvelle tentative sera faite automatiquement.",
            });
          }
          // A transient/network failure keeps the attribution for the next
          // foreground event or application launch.
          console.warn(
            "[ChottuLink] Le rattachement sera retenté ultérieurement:",
            error,
          );
        }
      } finally {
        isProcessing.current = false;
      }
    },
    [attachMyReferralAttribution, showDialog],
  );

  const processReferral = useCallback(
    async (payload: ChottuLinkReferralPayload) => {
      const now = Date.now();
      if (isDuplicateReferralEvent(lastProcessedEventRef.current, payload.token, now)) {
        return;
      }
      lastProcessedEventRef.current = { token: payload.token, processedAt: now };
      if (isProcessing.current) return;
      isProcessing.current = true;
      try {
        const existing = await getPendingReferralAttribution();
        if (existing && existing.token !== payload.token) {
          showDialog({
            variant: 'info',
            title: 'Première invitation conservée',
            message: `L'invitation de ${existing.referrerFirstName ?? 'votre premier parrain'} reste prioritaire pendant sa période de validité.`,
          });
          await trackEvent('referral_attribution_ignored', {
            reason: 'first_touch_already_captured',
          });
        }
        let selected = existing;
        if (!selected) {
          const resolved = await resolveReferralAttribution(
            payload.token,
          ).unwrap();
          selected = await captureFirstReferralAttribution({
            token: payload.token,
            provider: 'chottulink',
            capturedAt: payload.capturedAt,
            referringLink: payload.referringLink,
            referrerFirstName: resolved.referrer.firstName,
            isDeferred: payload.isDeferred,
          });
          if (selected) {
            await trackEvent('referral_attribution_captured', {
              source: payload.isDeferred ? 'deferred' : 'direct',
            });
          }
        }
        if (!selected) return;

        if (!shouldNavigateToReferralAuth(isAuthenticatedRef.current)) {
          // Release the capture lock before entering the shared attachment
          // routine, which owns the lock for the authenticated request.
          isProcessing.current = false;
          await attachPendingAttribution(selected);
          return;
        }

        router.replace({
          pathname: '/auth',
          params: { mode: 'signup', referralToken: selected.token },
        });
      } catch (error) {
        await trackEvent('referral_attribution_failed', {
          status: getReferralErrorStatus(error) ?? 'network',
          phase: 'link_resolution',
        });
        console.warn(
          "[ChottuLink] L'attribution de parrainage n'a pas pu etre validee:",
          error,
        );
      } finally {
        isProcessing.current = false;
      }
    },
    [attachPendingAttribution, resolveReferralAttribution, router, showDialog],
  );

  useEffect(
    () => subscribeToChottuLinkReferrals(processReferral),
    [processReferral],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    void getPendingReferralAttribution().then((pending) => {
      if (pending) void attachPendingAttribution(pending);
    });
  }, [attachPendingAttribution, isAuthenticated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !isAuthenticatedRef.current) return;
      void getPendingReferralAttribution().then((pending) => {
        if (pending) void attachPendingAttribution(pending);
      });
    });
    return () => subscription.remove();
  }, [attachPendingAttribution]);

  return null;
}
