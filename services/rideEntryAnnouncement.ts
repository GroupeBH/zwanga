export type RideEntryMessage = { key: string; text: string };
type Source = { userId: string; path: string; ready: boolean; message: RideEntryMessage | null };
type Gate = { userId: string; path: string; blocked: boolean };
let owner: string | undefined;
let gate: Gate | undefined;
let revision = 0;
let consumed = false;
let deadline = 0;
let settledAt = 0;
const sources = new Map<object, Source>();
const listeners = new Set<() => void>();
const notify = (invalidate = true) => { if (invalidate) revision++; settledAt = Date.now() + 500; listeners.forEach(listener => listener()); };
export const isRideSpeechScreen = (path: string) => path === '/' || path === '/(tabs)' || path === '/incoming-driver' ||
  /^\/(trip|booking)\/navigate\/[^/]+$/.test(path) || /^\/trip\/manage\/[^/]+$/.test(path) || /^\/request-details\/[^/]+$/.test(path);

/** One bounded entry window per account / return from background, not per render. */
export function beginRideSpeechEntry(userId: string) {
  if (owner !== userId) {
    for (const [token, source] of sources) if (source.userId !== userId) sources.delete(token);
    gate = undefined;
  }
  owner = userId; consumed = false; deadline = Date.now() + 30000; notify();
}
export function setRideSpeechEntryGate(next: Gate) {
  if (owner !== next.userId) beginRideSpeechEntry(next.userId);
  if (gate?.userId === next.userId && gate.path === next.path && gate.blocked === next.blocked) return;
  gate = next; notify();
}
export function publishRideEntrySource(token: object, source: Source) {
  const previous = sources.get(token);
  if (previous?.userId === source.userId && previous.path === source.path && previous.ready === source.ready &&
      previous.message?.key === source.message?.key && previous.message?.text === source.message?.text) return;
  // A refetch of the same event is not a new event. Keep the current sentence
  // valid, while still withholding a NEW announcement until data is ready.
  const sameEvent = previous?.userId === source.userId && previous.path === source.path &&
    previous.message?.key === source.message?.key && previous.message?.text === source.message?.text;
  sources.set(token, source); notify(!sameEvent);
}
export function removeRideEntrySource(token: object) { if (sources.delete(token)) notify(); }
export function readRideSpeechEntry(userId: string) {
  const base = { revision, userId, path: gate?.path ?? '', blocked: gate?.blocked ?? true, message: null as RideEntryMessage | null };
  // A profile subscription can briefly lag behind the authenticated identity.
  // Never fall back to old-account notifications in that interval.
  if (owner !== userId) return { ...base, status: owner ? 'waiting' as const : 'unmanaged' as const };
  if (consumed) return { ...base, status: 'done' as const };
  if (Date.now() >= deadline) return { ...base, status: 'expired' as const };
  if (Date.now() < settledAt) return { ...base, status: 'waiting' as const };
  if (!gate || gate.blocked) return { ...base, status: 'waiting' as const };
  if (!isRideSpeechScreen(gate.path)) return { ...base, status: 'ready' as const };
  const source = [...sources.values()].find(value => value.userId === userId && value.path === gate!.path);
  if (!source?.ready) return { ...base, status: 'waiting' as const };
  return { ...base, message: source.message, status: 'ready' as const };
}
export function isRideSpeechEntryCurrent(entry: ReturnType<typeof readRideSpeechEntry>) {
  return owner === entry.userId && entry.revision === revision && (consumed || Date.now() < deadline);
}
export function consumeRideSpeechEntry(entry: ReturnType<typeof readRideSpeechEntry>) {
  if (isRideSpeechEntryCurrent(entry)) consumed = true;
}
export function hasPendingRideSpeechEntry(userId: string) {
  return owner === userId && !consumed && Date.now() < deadline;
}
export function subscribeRideSpeechEntry(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function clearRideSpeechEntry() {
  owner = undefined; gate = undefined; sources.clear(); consumed = false; deadline = 0; notify();
}
