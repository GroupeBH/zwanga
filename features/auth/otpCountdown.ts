import { getTokenSessionVersion } from '@/services/tokenSession';

export type OtpCountdownPurpose = 'phone_verification' | 'pin_reset' | 'pin_change';
type Ticket = { purpose: OtpCountdownPurpose; phone: string; session: number; startedAt: number };
type Window = Ticket & { deadline: number | null };
const pending = new Map<OtpCountdownPurpose, Ticket>();
const windows = new Map<OtpCountdownPurpose, Window>();
const listeners = new Set<() => void>();
const phoneKey = (phone: string) => {
  const value = phone.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (/^0\d{9}$/.test(value)) return '+243' + value.slice(1);
  if (/^243\d{9}$/.test(value)) return '+' + value;
  return value;
};

// Metadata only, memory only, at most one window per purpose. Never stores a code or proof.
export function beginOtpCountdown(purpose: OtpCountdownPurpose, phone = ''): Ticket {
  const ticket = { purpose, phone: phoneKey(phone), session: getTokenSessionVersion(), startedAt: Date.now() };
  pending.set(purpose, ticket);
  return ticket;
}
export function completeOtpCountdown(ticket: Ticket, seconds: unknown) {
  if (pending.get(ticket.purpose) !== ticket || ticket.session !== getTokenSessionVersion()) return;
  const valid = typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400;
  // Start before the request: network/provider delays must not extend the displayed validity.
  windows.set(ticket.purpose, { ...ticket, deadline: valid ? ticket.startedAt + seconds * 1000 : null });
  listeners.forEach(listener => listener());
}
export function readOtpDeadline(purpose: OtpCountdownPurpose, phone = ''): number | null {
  const value = windows.get(purpose);
  return value?.session === getTokenSessionVersion() && value.phone === phoneKey(phone) ? value.deadline : null;
}
export function subscribeOtpCountdown(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function otpRemainingSeconds(deadline: number | null, now = Date.now()): number | null {
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}
export function otpCountdownLabel(seconds: number | null): string {
  if (seconds === null) return 'Le code expire automatiquement. Renvoyez-le si nécessaire.';
  if (seconds === 0) return 'Code expiré — renvoyez un code.';
  return 'Code valable encore ' + Math.floor(seconds / 60).toString().padStart(2, '0') + ':' +
    (seconds % 60).toString().padStart(2, '0');
}
export function trackOtpCountdown(purpose: OtpCountdownPurpose) {
  return async (arg: { phone: string } | void, lifecycle: { queryFulfilled: Promise<{ data: { expiresInSeconds?: number } }> }) => {
    const ticket = beginOtpCountdown(purpose, arg?.phone);
    try {
      const { data } = await lifecycle.queryFulfilled;
      completeOtpCountdown(ticket, data.expiresInSeconds);
    } catch { /* A rejected resend never refreshes the old countdown. */ }
  };
}
