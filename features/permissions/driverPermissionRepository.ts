export type DriverPermissionKind = 'location' | 'fullScreen';
export type DriverPermissionHistory = {
  version: 1;
  firstVisit: number;
  publishedVisit: number | null;
  promptedAt: Partial<Record<DriverPermissionKind, number>>;
};
export const DRIVER_PERMISSION_DELAY_MS = 15_000;
export const DRIVER_PERMISSION_REMINDER_MS = 24 * 60 * 60 * 1000;
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Bound = <T>(promise: Promise<T>, ms: number) => Promise<T>;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Local onboarding history, never a substitute for checking OS permissions. */
export function createDriverPermissionRepository(storage: Storage, bound: Bound) {
  const writes = new Map<string, Promise<unknown>>();
  const key = (userId: string) => `driver-permission-onboarding:v1:${userId}`;
  const serial = <T>(userId: string, work: () => Promise<T>): Promise<T> => {
    const result = (writes.get(userId) ?? Promise.resolve()).catch(() => {}).then(work);
    writes.set(userId, result);
    const cleanup = () => { if (writes.get(userId) === result) writes.delete(userId); };
    void result.then(cleanup, cleanup);
    return result;
  };
  const read = async (userId: string, visit: number): Promise<DriverPermissionHistory> => {
    if (!userId || !timestamp(visit)) throw new Error('Invalid permission history owner');
    const raw = await bound(storage.getItem(key(userId)), 2000);
    if (!raw) return { version: 1, firstVisit: visit, publishedVisit: null, promptedAt: {} };
    const value = JSON.parse(raw) as DriverPermissionHistory;
    if (value?.version !== 1 || !timestamp(value.firstVisit) ||
        (value.publishedVisit !== null && !timestamp(value.publishedVisit)) || !value.promptedAt ||
        ['location', 'fullScreen'].some(kind => {
          const date = value.promptedAt[kind as DriverPermissionKind];
          return date !== undefined && !timestamp(date);
        })) throw new Error('Invalid permission history');
    return value;
  };
  const save = (userId: string, value: DriverPermissionHistory) => bound(storage.setItem(key(userId), JSON.stringify(value)), 2000);
  return {
    visit: (userId: string, visit: number) => serial(userId, async () => {
      const value = await read(userId, visit);
      if (value.firstVisit === visit) await save(userId, value);
      return value;
    }),
    published: (userId: string, visit: number) => serial(userId, async () => {
      const value = await read(userId, visit);
      if (value.publishedVisit !== null) return false;
      value.publishedVisit = visit;
      await save(userId, value);
      return true;
    }),
    // Reserve before presentation: a crash/remount must not cause a prompt loop.
    prompted: (userId: string, visit: number, kind: DriverPermissionKind, now: number) => serial(userId, async () => {
      const value = await read(userId, visit);
      if (!timestamp(now)) throw new Error('Invalid permission prompt time');
      value.promptedAt[kind] = now;
      await save(userId, value);
      return value;
    }),
  };
}

export function isDriverPermissionPromptDue(history: DriverPermissionHistory, kind: DriverPermissionKind, now: number) {
  const last = history.promptedAt[kind];
  // A backwards clock never floods the user with prompts.
  return last === undefined || now - last >= DRIVER_PERMISSION_REMINDER_MS;
}

export function isDriverPermissionVisitEligible(history: DriverPermissionHistory, visit: number, stayed: boolean) {
  return history.publishedVisit === visit || (history.firstVisit !== visit && stayed);
}
