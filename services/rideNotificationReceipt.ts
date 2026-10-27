import { NativeModules } from 'react-native';
import { isInvitationId, parseDriverInvitation } from '@/features/notifications/driverInvitation';
import { parseNearbyPhoneAlert } from '@/features/notifications/rideSound';
import { getTokenSessionVersion } from './tokenSession';
import { boundedRideAudio } from './rideAudioDiagnostics';

const sent = new Map<string, number>();
const sending = new Set<string>();
let unsupportedUntil = 0;
let flushing = false;
type ReceiptDetail = { observedAt?: string; source?: 'native' | 'javascript'; failureCode?: string };
/** Telemetry only: never awaited by the notification/audio presentation. */
export async function reportRideNotificationReceipt(data: Record<string, unknown>, stage: 'received' | 'displayed', detail: ReceiptDetail = { observedAt: new Date().toISOString(), source: 'javascript' }) {
  const id = data.notificationId, user = data.driverId;
  if (!isInvitationId(id) || !isInvitationId(user)) return;
  const invitation = parseDriverInvitation(data) ?? parseNearbyPhoneAlert(data);
  if (invitation) {
    try { NativeModules?.ZwangaDriverAlerts?.recordNativeRideReceipt?.(user, id, stage === 'displayed', `driver-${invitation.kind}-${invitation.id}`); }
    catch { /* Optional native deduplication cannot block the receipt. */ }
  }
  if (Date.now() < unsupportedUntil) return;
  const version = getTokenSessionVersion(), key = `${version}:${user}:${id}:${stage}`;
  if ((sent.get(key) ?? 0) > Date.now() || sending.has(key) || sending.size >= 4) return;
  sending.add(key);
  let request: { abort(): void; reset(): void } | undefined;
  try {
    const { store } = await import('@/store');
    if (version !== getTokenSessionVersion() || store.getState().auth.user?.id !== user) return;
    const { driverDispatchApi } = await import('@/store/api/driverDispatchApi');
    if (version !== getTokenSessionVersion() || store.getState().auth.user?.id !== user) return;
    const pending = store.dispatch(driverDispatchApi.endpoints.recordRideNotificationReceipt.initiate({ notificationId: id, stage, ...detail }));
    request = pending;
    try { await boundedRideAudio(pending.unwrap(), 5000); }
    catch (error) {
      // During a rolling deployment an older DTO may reject the extra metadata.
      if (Number((error as { status?: unknown })?.status) === 400 && version === getTokenSessionVersion()) {
        pending.abort(); pending.reset();
        const legacy = store.dispatch(driverDispatchApi.endpoints.recordRideNotificationReceipt.initiate({ notificationId: id, stage }));
        request = legacy;
        await boundedRideAudio(legacy.unwrap(), 4000);
        sent.set(key, Date.now() + 86400000); return;
      }
      if ([404, 405].includes(Number((error as { status?: unknown })?.status))) unsupportedUntil = Date.now() + 60000;
      sent.set(key, Date.now() + 15000); return;
    }
    sent.set(key, Date.now() + 86400000);
  } catch { sent.set(key, Date.now() + 15000); }
  finally {
    request?.abort(); request?.reset(); sending.delete(key);
    while (sent.size > 200) sent.delete(sent.keys().next().value!);
  }
}

export async function flushNativeRideReceipts(userId: string) {
  if (flushing) return;
  flushing = true;
  try {
    const version = getTokenSessionVersion();
    const stopAt = Date.now() + 8000;
    const raw = await boundedRideAudio(NativeModules?.ZwangaDriverAlerts?.getNativeRideReceipts?.(userId) ?? Promise.resolve('{}'), 2000);
    if (version !== getTokenSessionVersion()) return;
    const receipts = JSON.parse(typeof raw === 'string' ? raw : '{}') as Record<string, { displayed?: boolean; at?: number; displayedAt?: number; failureCode?: string }>;
    // Sequential, bounded, off the critical display path; errors are retried on re-entry.
    for (const [notificationId, receipt] of Object.entries(receipts).slice(-100)) {
      if (version !== getTokenSessionVersion() || Date.now() > stopAt) break;
      const at = receipt.displayed ? receipt.displayedAt ?? receipt.at : receipt.at;
      const failureCode = ['NATIVE_CARD_FAILED', 'NATIVE_CARD_PENDING', 'NATIVE_FALLBACK_FAILED'].includes(receipt.failureCode ?? '') ? receipt.failureCode : undefined;
      await reportRideNotificationReceipt({ notificationId, driverId: userId }, receipt.displayed ? 'displayed' : 'received', {
        source: 'native', ...(typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= Date.now() + 300000 ? { observedAt: new Date(at).toISOString() } : {}), failureCode,
      });
    }
  } catch { /* Best effort telemetry cannot prevent entry or ringing. */ }
  finally { flushing = false; }
}
