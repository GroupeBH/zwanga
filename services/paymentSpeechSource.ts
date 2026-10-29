import type { RideEntryMessage } from './rideEntryAnnouncement';

export type ScreenSpeechKind = 'payment' | 'wallet';
type Source = { userId: string; version: number; message: RideEntryMessage; deadline: number; consumed: boolean; kind: ScreenSpeechKind };
const sources = new Map<object, Source>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export function publishPaymentSpeech(token: object, userId: string, version: number, message: RideEntryMessage, kind: ScreenSpeechKind = 'payment') {
  const previous = sources.get(token);
  if (previous?.userId === userId && previous.version === version && previous.message.key === message.key && previous.message.text === message.text && previous.kind === kind) return;
  sources.set(token, { userId, version, message, deadline: Date.now() + 30000, consumed: false, kind });
  notify();
}
export function removePaymentSpeech(token: object) { if (sources.delete(token)) notify(); }
export function readPaymentSpeech(userId: string, version: number) {
  const visible = [...sources.values()].reverse().filter(source => source.userId === userId && source.version === version);
  // An arrival/payment overlay must stay ahead of the underlying wallet, even
  // after a wallet refetch. Consumed overlays still own their visible screen.
  return visible.find(source => source.kind === 'payment') ?? visible[0];
}
export function paymentSpeechPending(source: Source | undefined) {
  return Boolean(source && !source.consumed && Date.now() < source.deadline);
}
export function consumePaymentSpeech(source: Source) { source.consumed = true; notify(); }
export function subscribePaymentSpeech(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
