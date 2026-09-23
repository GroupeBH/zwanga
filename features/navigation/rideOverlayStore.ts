import type { ReactNode } from 'react';

export const RIDE_OVERLAY_PRIORITY = { information: 10, panel: 30, confirmation: 80, payment: 70, sos: 100 };
export type RideOverlayEntry = {
  id: string;
  scope: string;
  priority: number;
  children: ReactNode;
  onRequestClose?: () => void;
};
export type RideNotice = { title: string; message?: string; expiresAt: number };

/** UI only: never owns GPS, payments or ride state. No native modal presentations in a ride scope. */
export function createRideOverlayStore() {
  const scopes = new Set<string>();
  const nativeOwners = new Set<string>();
  const entries = new Map<string, RideOverlayEntry>();
  const notices = new Map<string, RideNotice>();
  const queuedNotices = new Map<string, RideNotice[]>();
  const listeners = new Set<() => void>();
  let active: RideOverlayEntry | null = null;
  let snapshot: RideOverlayEntry[] = [];
  const notify = () => {
    snapshot = [...entries.values()];
    let next: RideOverlayEntry | null = null;
    if (!nativeOwners.size) {
      for (const entry of entries.values()) {
        if (entry.scope !== 'global' && !scopes.has(entry.scope)) continue;
        if (!next || entry.priority >= next.priority) next = entry;
      }
    }
    active = next;
    listeners.forEach(listener => listener());
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getActive: () => active,
    getEntries: () => snapshot,
    hasNavigation: () => scopes.size > 0,
    // Includes UIKit dismissals still in flight, not just the currently visible overlay.
    isBusy: () => scopes.size > 0 || nativeOwners.size > 0 || entries.size > 0,
    getNotice: (scope: string) => notices.get(scope) ?? null,
    setScope(scope: string, enabled: boolean) {
      if (scopes.has(scope) === enabled) return;
      if (enabled) scopes.add(scope);
      else {
        scopes.delete(scope);
        notices.delete(scope);
        queuedNotices.delete(scope);
        for (const [id, entry] of entries) if (entry.scope === scope) entries.delete(id);
      }
      notify();
    },
    put(entry: RideOverlayEntry) { entries.set(entry.id, entry); notify(); },
    remove(id: string) { if (entries.delete(id)) notify(); },
    blockNative(id: string, blocked: boolean) {
      if (nativeOwners.has(id) === blocked) return;
      if (blocked) nativeOwners.add(id); else nativeOwners.delete(id);
      notify();
    },
    showNotice(scope: string, notice: RideNotice) {
      if (!scopes.has(scope)) return;
      const current = notices.get(scope);
      const queue = queuedNotices.get(scope) ?? [];
      if ([current, ...queue].some(item => item?.title === notice.title && item.message === notice.message)) return;
      if (current) {
        // Bounded informational FIFO, not a payment/confirmation queue.
        if (queue.length >= 20) queue.shift();
        queue.push(notice);
        queuedNotices.set(scope, queue);
      } else notices.set(scope, notice);
      notify();
    },
    clearNotice(scope: string, expected?: RideNotice) {
      if (expected && notices.get(scope) !== expected) return;
      const next = queuedNotices.get(scope)?.shift();
      if (next) { notices.set(scope, { ...next, expiresAt: Date.now() + 10_000 }); notify(); }
      else if (notices.delete(scope)) { queuedNotices.delete(scope); notify(); }
    },
    clearNotices(scope: string) {
      queuedNotices.delete(scope);
      if (notices.delete(scope)) notify();
    },
  };
}
export type RideOverlayStore = ReturnType<typeof createRideOverlayStore>;
