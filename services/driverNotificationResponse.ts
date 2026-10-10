import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { Platform } from 'react-native';
import { getTokens } from './tokenStorage';
import { getTokenSessionVersion } from './tokenSession';
import { decodeJWT } from '@/utils/jwt';
import { notificationDecision, type DriverInvitation } from '@/features/notifications/driverInvitation';
import { dismissDriverInvitation } from './driverNotifications';

const inFlight = new Map<string, Promise<void>>();
const completed = new Set<string>();
const RESULT_CHANNEL = 'driver-responses-v1';

/** Runs only for a native action, never on receipt or from an arbitrary deep link. */
export async function respondToDriverNotification(invitation: DriverInvitation, actionId?: string): Promise<void> {
  const decision = notificationDecision(actionId);
  if (!decision) return;
  const sessionVersion = getTokenSessionVersion();
  const key = `${sessionVersion}:${invitation.driverId}:${invitation.kind}:${invitation.id}`;
  if (completed.has(key)) return;
  const previous = inFlight.get(key);
  if (previous) return previous;
  const work = (async () => {
    let message: string;
    let success = false;
    // Stop the local notification sound at the tap, even on a slow network.
    await dismissDriverInvitation(invitation).catch(() => {});
    try {
      const { accessToken } = await getTokens({ throwOnError: true });
      const payload = accessToken ? decodeJWT(accessToken) : null;
      const userId = payload?.sub ?? payload?.userId;
      if (!userId || userId !== invitation.driverId || sessionVersion !== getTokenSessionVersion())
        throw new Error('session');
      // RTK Query restores/refreshed credentials through SecureStore even without a mounted UI.
      // Both endpoints enforce ownership, deadline, status and idempotency on the server.
      const [{ store }, { driverDispatchApi }] = await Promise.all([import('@/store'), import('@/store/api/driverDispatchApi')]);
      if (sessionVersion !== getTokenSessionVersion()) throw new Error('session');
      const request = invitation.kind === 'dispatch'
        ? store.dispatch(driverDispatchApi.endpoints.respondToDispatchOffer.initiate({ id: invitation.id, decision }))
        : store.dispatch(driverDispatchApi.endpoints.respondToBookingInvitation.initiate({ id: invitation.id, accept: decision === 'accept' }));
      let result: unknown;
      try { result = await request.unwrap(); } finally { request.reset(); }
      if (sessionVersion !== getTokenSessionVersion()) return;
      // Headless actions may run before Redux auth hydration; use the verified token owner.
      if (invitation.kind === 'dispatch' && decision === 'accept' && result && typeof result === 'object' &&
        'status' in result && result.status === 'accepted' && 'requestId' in result && typeof result.requestId === 'string') {
        const { inviteAcceptedRequestContact } = await import('@/store/slices/rideEntrySlice');
        if (sessionVersion !== getTokenSessionVersion()) return;
        store.dispatch(inviteAcceptedRequestContact({ userId, requestId: result.requestId }));
      }
      success = true;
      message = decision === 'accept' ? 'Vous avez accepté. Consultez les détails pour la prise en charge.' : 'Votre refus a été enregistré.';
      completed.add(key);
      if (completed.size > 100) completed.delete(completed.values().next().value!);
    } catch {
      // Never save an offline decision to replay later. A timeout may have reached the server.
      if (sessionVersion !== getTokenSessionVersion()) return;
      message = 'Votre réponse n’est pas confirmée. Ouvrez la demande pour vérifier son état ou réessayer.';
    }
    try {
      if (Platform.OS === 'android') await notifee.createChannel({ id: RESULT_CHANNEL, name: 'Réponses aux trajets', importance: AndroidImportance.LOW });
      const navigateTo = `/incoming-driver?kind=${invitation.kind}&id=${invitation.id}&driverId=${invitation.driverId}`;
      await notifee.displayNotification({ id: `driver-result-${invitation.kind}-${invitation.id}`,
        title: success ? 'Réponse enregistrée' : 'Réponse à vérifier', body: message,
        data: { type: 'driver_action_result', navigateTo, kind: invitation.kind, id: invitation.id, driverId: invitation.driverId },
        android: { channelId: RESULT_CHANNEL, importance: AndroidImportance.LOW, visibility: AndroidVisibility.PRIVATE,
          onlyAlertOnce: true, autoCancel: true, pressAction: { id: 'default', launchActivity: 'default' } },
        ios: { foregroundPresentationOptions: { sound: false, badge: false, banner: true, list: true } },
      });
    } catch { /* Delivery of feedback cannot undo a server-confirmed response. */ }
  })();
  inFlight.set(key, work);
  try { await work; } finally { inFlight.delete(key); }
}
