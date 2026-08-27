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
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const getErrorStatus = (error: unknown) => {
  if (!error || typeof error !== 'object') return null;
  const value = error as { status?: unknown; originalStatus?: unknown };
  const status = value.status ?? value.originalStatus;
  return typeof status === 'number' ? status : null;
};

const isDefinitiveAttributionError = (error: unknown) => {
  const status = getErrorStatus(error);
  return status !== null && [400, 404, 409, 422].includes(status);
};

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

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

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
          status: getErrorStatus(error) ?? 'network',
          phase: 'authenticated_attachment',
        });
        if (isDefinitiveAttributionError(error)) {
          await consumePendingReferralAttribution(pending.token);
          showDialog({
            variant: 'warning',
            title: 'Invitation non appliquée',
            message: getApiErrorMessage(
              error,
              'Ce compte possède déjà un parrain ou cette invitation ne peut plus être utilisée.',
            ),
          });
        } else {
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
      if (isProcessing.current) return;
      isProcessing.current = true;
      try {
        const existing = await getPendingReferralAttribution();
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

        if (isAuthenticatedRef.current) {
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
          status: getErrorStatus(error) ?? 'network',
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
    [attachPendingAttribution, resolveReferralAttribution, router],
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
