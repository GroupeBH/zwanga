import {
  MAX_RIDE_EVENTS,
  OFFLINE_RIDE_MAX_AGE,
  rideRetry,
  type RideDeclaration,
  type RideOutboxEntry,
  type RideSnapshot,
} from './rideRecoveryModel';

interface Dependencies {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  userId(): string | undefined;
  publish(userId: string, entries: RideOutboxEntry[]): void;
  send(event: RideDeclaration): Promise<RideSnapshot>;
  read(bookingId: string): Promise<RideSnapshot>;
  uuid(): string;
  now(): number;
  canSend?(): boolean;
}
export class RideOutboxError extends Error {}
const keyFor = (userId: string) => `@zwanga/ride-outbox/v1/${userId}`;

/** All disk mutations are serialized; networking never holds the disk lock. */
export function createRideOutbox(deps: Dependencies) {
  let lock = Promise.resolve();
  let flushing = false;
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = lock.then(fn, fn);
    lock = result.then(() => undefined, () => undefined);
    return result;
  };
  async function read(userId: string): Promise<RideOutboxEntry[]> {
    const raw = await deps.storage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_RIDE_EVENTS || parsed.some(item =>
      !item || item.actorUserId !== userId || typeof item.eventId !== 'string' || typeof item.bookingId !== 'string' ||
      typeof item.tripId !== 'string' || !['pickup', 'dropoff'].includes(item.stage) ||
      !['confirm', 'reject'].includes(item.decision) || !Number.isFinite(Date.parse(item.occurredAt)) ||
      !Number.isInteger(item.attempts) || item.attempts < 0 || !Number.isFinite(item.nextAttemptAt) ||
      !['queued', 'sending', 'received', 'confirmed', 'disputed', 'blocked'].includes(item.state))) {
      // Never replace damaged pending confirmations with an empty queue.
      throw new RideOutboxError('Les confirmations sauvegardées ne peuvent pas être lues. Contactez l’assistance.');
    }
    return parsed as RideOutboxEntry[];
  }
  async function save(userId: string, entries: RideOutboxEntry[]) {
    await deps.storage.setItem(keyFor(userId), JSON.stringify(entries));
    if (deps.userId() === userId) deps.publish(userId, entries);
  }
  async function update(userId: string, eventId: string, patch: Partial<RideOutboxEntry>) {
    return exclusive(async () => {
      const entries = await read(userId);
      await save(userId, entries.map(entry => entry.eventId === eventId ? { ...entry, ...patch } : entry));
    });
  }
  return {
    hydrate: () => exclusive(async () => {
      const userId = deps.userId();
      if (!userId) return;
      const entries = (await read(userId)).map(entry => entry.state === 'sending' ? { ...entry, state: 'queued' as const, nextAttemptAt: 0 } : entry);
      await save(userId, entries);
    }),
    enqueue: (input: Omit<RideDeclaration, 'eventId' | 'occurredAt' | 'actorUserId'>) => {
      // Capture the actor when tapped, not after earlier disk writes complete.
      const userId = deps.userId();
      return exclusive(async () => {
        if (!userId) throw new RideOutboxError('Connectez-vous pour enregistrer votre confirmation.');
        if (deps.userId() !== userId) throw new RideOutboxError('Le compte a changé. Rouvrez le trajet avant de confirmer.');
        const entries = await read(userId);
        const existing = entries.find(entry => entry.bookingId === input.bookingId && entry.stage === input.stage);
        if (existing) {
          if (existing.decision !== input.decision) throw new RideOutboxError('Votre réponse est déjà enregistrée. Contactez l’assistance pour la corriger.');
          return existing;
        }
        const retained = entries.filter(entry => entry.state !== 'confirmed' || deps.now() - Date.parse(entry.occurredAt) < OFFLINE_RIDE_MAX_AGE);
        if (retained.length >= MAX_RIDE_EVENTS) {
          const confirmed = retained.findIndex(entry => entry.state === 'confirmed');
          if (confirmed !== -1) retained.splice(confirmed, 1); // Server owns completed history.
        }
        if (retained.length >= MAX_RIDE_EVENTS) throw new RideOutboxError('Trop de confirmations sont en attente. Retrouvez une connexion ou contactez l’assistance.');
        const entry: RideOutboxEntry = { ...input, actorUserId: userId, eventId: deps.uuid(), occurredAt: new Date(deps.now()).toISOString(), state: 'queued', attempts: 0, nextAttemptAt: 0 };
        await save(userId, [...retained, entry]); // Durable BEFORE UI acknowledgement or HTTP.
        return entry;
      });
    },
    async flush() {
      if (flushing) return;
      const userId = deps.userId();
      if (!userId) return;
      flushing = true;
      try {
        const candidates = await exclusive(() => read(userId));
        const snapshots = new Map<string, RideSnapshot>();
        // FIFO per booking; independent passengers are not blocked by another's conflict.
        for (const entry of candidates) {
          if (deps.userId() !== userId || deps.canSend?.() === false) return;
          if (!['queued', 'sending', 'received'].includes(entry.state) || entry.nextAttemptAt > deps.now()) continue;
          if (deps.now() - Date.parse(entry.occurredAt) > OFFLINE_RIDE_MAX_AGE) {
            await update(userId, entry.eventId, { state: 'blocked', message: 'Cette confirmation est trop ancienne pour être transmise automatiquement. Contactez l’assistance.' });
            continue;
          }
          try {
            let snapshot: RideSnapshot;
            if (entry.state === 'received') snapshot = snapshots.get(entry.bookingId) ?? await deps.read(entry.bookingId);
            else {
              await update(userId, entry.eventId, { state: 'sending' });
              if (deps.userId() !== userId || deps.canSend?.() === false) {
                await update(userId, entry.eventId, { state: 'queued' });
                return;
              }
              const { state: _state, attempts: _attempts, nextAttemptAt: _next, message: _message, ...event } = entry;
              snapshot = await deps.send(event);
            }
            const status = snapshot[entry.stage]?.status;
            if (snapshot.bookingId !== entry.bookingId || !['none', 'awaiting_other', 'ready', 'confirmed', 'disputed'].includes(status)) throw new Error('Invalid acknowledgement');
            snapshots.set(entry.bookingId, snapshot);
            await update(userId, entry.eventId, { state: status === 'confirmed' ? 'confirmed' : status === 'disputed' ? 'disputed' : 'received', nextAttemptAt: deps.now() + 60_000, message: undefined });
          } catch (error) {
            if (deps.userId() !== userId) {
              await update(userId, entry.eventId, { state: entry.state === 'received' ? 'received' : 'queued', nextAttemptAt: 0 });
              return;
            }
            const retry = rideRetry(error, entry.attempts, deps.now());
            // Once receipt is known, only read the server state, never resend it.
            await update(userId, entry.eventId, { ...retry, state: entry.state === 'received' && retry.state === 'queued' ? 'received' : retry.state, attempts: entry.attempts + 1 });
          }
        }
      } finally { flushing = false; }
    },
  };
}
