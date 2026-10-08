import { useDialog } from '@/components/ui/DialogProvider';
import { useAppIsActive } from '@/hooks/useAppIsActive';
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
  captureUnresolvedReferralAttribution,
  clearUnresolvedReferralAttribution,
  consumePendingReferralAttribution,
  getPendingReferralAttribution,
  getUnresolvedReferralAttribution,
  type PendingReferralAttribution,
} from '@/utils/referralAttribution';
import {
  getReferralErrorStatus,
  isDefinitiveAuthenticatedAttributionError,
  isDuplicateReferralEvent,
} from '@/utils/referralAttributionPolicy';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/** Durable capture precedes network validation; only the server attaches accounts. */
export function ReferralAttributionHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const { showDialog } = useDialog();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(state => state.auth.user?.id);
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const active = useAppIsActive();
  const [resolveReferralAttribution] = useResolveReferralAttributionMutation();
  const [attachMyReferralAttribution] = useAttachMyReferralAttributionMutation();
  const current = useRef({ isAuthenticated, userId, online, active, pathname });
  current.current = { isAuthenticated, userId, online, active, pathname };
  const mounted = useRef(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const lastProcessedEvent = useRef<{ token: string; processedAt: number } | null>(null);
  const lastRetryNoticeToken = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const notifyRetry = useCallback((token: string) => {
    if (!mounted.current || !current.current.active || lastRetryNoticeToken.current === token) return;
    lastRetryNoticeToken.current = token;
    showDialog({
      variant: 'info', title: 'Invitation conservée',
      message: 'Votre invitation est enregistrée sur ce téléphone. Zwanga réessaiera automatiquement de valider votre parrainage au retour de la connexion.',
    });
  }, [showDialog]);

  const attachPending = useCallback(async (pending: PendingReferralAttribution) => {
    const account = current.current.userId;
    if (!current.current.isAuthenticated || !account) return;
    try {
      const result = await attachMyReferralAttribution({
        referralToken: pending.token, referralProvider: pending.provider,
        referralReferringLink: pending.referringLink, referralCapturedAt: pending.capturedAt,
      }).unwrap();
      await consumePendingReferralAttribution(pending.token);
      lastRetryNoticeToken.current = null;
      void trackEvent('referral_attribution_attached', {
        newly_attached: result.newlyAttached, source: pending.isDeferred ? 'deferred' : 'direct',
      }).catch(() => undefined);
      if (!mounted.current || current.current.userId !== account || !current.current.active) return;
      showDialog({
        variant: 'success',
        title: result.newlyAttached ? 'Invitation prise en compte' : 'Parrainage déjà enregistré',
        message: result.newlyAttached
          ? `Votre compte est maintenant rattaché à ${result.referrer.firstName}.`
          : `Votre compte est déjà rattaché à ${result.referrer.firstName}.`,
      });
    } catch (error) {
      void trackEvent('referral_attribution_failed', {
        status: getReferralErrorStatus(error) ?? 'network', phase: 'authenticated_attachment',
      }).catch(() => undefined);
      if (isDefinitiveAuthenticatedAttributionError(error)) {
        await consumePendingReferralAttribution(pending.token);
        lastRetryNoticeToken.current = null;
        if (!mounted.current || current.current.userId !== account || !current.current.active) return;
        showDialog({
          variant: 'warning', title: 'Invitation non appliquée',
          message: getApiErrorMessage(error, 'Ce compte possède déjà un parrain ou cette invitation ne peut plus être utilisée.'),
        });
      } else {
        notifyRetry(pending.token);
      }
    }
  }, [attachMyReferralAttribution, notifyRetry, showDialog]);

  const processReferral = useCallback(async (payload?: ChottuLinkReferralPayload) => {
    if (!mounted.current) return;
    let candidate: PendingReferralAttribution | null = null;
    try {
      let selected = await getPendingReferralAttribution();
      candidate = await getUnresolvedReferralAttribution();
      if (payload) {
        const first = selected ?? candidate;
        if (first && first.token !== payload.token && current.current.active) {
          showDialog({
            variant: 'info', title: 'Première invitation conservée',
            message: 'Votre première invitation reste prioritaire pendant sa période de validité.',
          });
        }
        if (!first) {
          // Persist BEFORE any HTTP request, including public token resolution.
          candidate = await captureUnresolvedReferralAttribution({ ...payload, provider: 'chottulink' });
        }
      }
      if (!mounted.current) return;
      if (!current.current.online || !current.current.active) {
        if (payload && (selected || candidate)) notifyRetry((selected ?? candidate)!.token);
        return;
      }
      let newlyResolved = false;
      if (!selected && candidate) {
        const resolved = await resolveReferralAttribution(candidate.token).unwrap();
        selected = await captureFirstReferralAttribution({
          ...candidate, referrerFirstName: resolved.referrer.firstName,
        });
        newlyResolved = true;
        void trackEvent('referral_attribution_captured', {
          source: candidate.isDeferred ? 'deferred' : 'direct',
        }).catch(() => undefined);
      }
      // Promotion is durable before deletion. A restart between these writes
      // finds the validated record and safely finishes cleanup before attachment.
      if (candidate && (selected || newlyResolved)) await clearUnresolvedReferralAttribution(candidate.token);
      if (!selected || !mounted.current || !current.current.active || !current.current.online) return;
      if (current.current.isAuthenticated) {
        await attachPending(selected);
      } else if ((payload || newlyResolved) && current.current.pathname !== '/auth') {
        router.replace({ pathname: '/auth', params: { mode: 'signup', referralToken: selected.token } });
      }
    } catch (error) {
      void trackEvent('referral_attribution_failed', {
        status: getReferralErrorStatus(error) ?? 'network', phase: 'link_resolution',
      }).catch(() => undefined);
      if (candidate && isDefinitiveAuthenticatedAttributionError(error)) {
        await clearUnresolvedReferralAttribution(candidate.token);
        lastRetryNoticeToken.current = null;
        if (mounted.current && current.current.active) showDialog({
          variant: 'warning', title: 'Invitation non appliquée',
          message: getApiErrorMessage(error, 'Cette invitation est invalide ou a expiré.'),
        });
      } else if (candidate) {
        notifyRetry(candidate.token);
      } else if (payload) {
        // Do not claim persistence when the device storage write failed.
        lastProcessedEvent.current = null;
        if (mounted.current && current.current.active) showDialog({
          variant: 'warning', title: 'Invitation non enregistrée',
          message: 'Zwanga n’a pas pu conserver cette invitation sur votre téléphone. Veuillez rouvrir le lien pour réessayer.',
        });
      }
    }
  }, [attachPending, notifyRetry, resolveReferralAttribution, router, showDialog]);

  // Serialize native duplicates, connectivity changes and authentication changes.
  // A reconnect during an HTTP failure is queued, not lost behind a busy flag.
  const enqueue = useCallback((payload?: ChottuLinkReferralPayload) => {
    const task = queue.current.then(() => processReferral(payload));
    queue.current = task.catch(() => {
      // Storage errors cannot escape an event callback or promise chain.
      console.warn('[Referral] Traitement local de l’invitation indisponible.');
    });
    return queue.current;
  }, [processReferral]);

  useEffect(() => subscribeToChottuLinkReferrals(payload => {
    const now = Date.now();
    if (isDuplicateReferralEvent(lastProcessedEvent.current, payload.token, now)) return;
    lastProcessedEvent.current = { token: payload.token, processedAt: now };
    void enqueue(payload);
  }), [enqueue]);

  useEffect(() => {
    if (online && active) void enqueue();
  }, [active, online, isAuthenticated, userId, enqueue]);

  return null;
}
