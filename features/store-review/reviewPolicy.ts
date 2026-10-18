import type { ReviewCompletion, ReviewRole } from './reviewEligibility';

export const REVIEW_YEAR_MS = 365 * 24 * 60 * 60_000;
export const MAX_REVIEW_ATTEMPTS = 3;
export const MAX_REVIEW_RECEIPTS = 2048;
const roles: ReviewRole[] = ['passenger', 'driver'];
type Progress = { count: number; promptedCount: number; ignoredBefore: number; seen: Record<string, number> };
export type ReviewHistory = {
  version: 1;
  initializedAt: number;
  attempts: number[];
  passenger: Progress;
  driver: Progress;
};

export function newReviewHistory(now: number): ReviewHistory {
  const progress = (): Progress => ({ count: 0, promptedCount: 0, ignoredBefore: now, seen: {} });
  return { version: 1, initializedAt: now, attempts: [], passenger: progress(), driver: progress() };
}

const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Fail closed if corrupt: never reset the quota silently after an unreadable history. */
export function parseReviewHistory(raw: string | null, initializedAt: number): ReviewHistory {
  if (raw === null) return newReviewHistory(initializedAt);
  const data = JSON.parse(raw) as ReviewHistory;
  if (!data || data.version !== 1 || !validTime(data.initializedAt) || !Array.isArray(data.attempts)
    || data.attempts.length > MAX_REVIEW_ATTEMPTS || !data.attempts.every(validTime)
    || !roles.every(role => {
      const progress = data[role];
      return progress && count(progress.count) && count(progress.promptedCount)
        && progress.promptedCount <= progress.count && validTime(progress.ignoredBefore)
        && progress.ignoredBefore >= data.initializedAt && progress.seen && typeof progress.seen === 'object'
        && !Array.isArray(progress.seen) && Object.keys(progress.seen).length <= MAX_REVIEW_RECEIPTS
        && Object.values(progress.seen).every(validTime);
    })) throw new Error('Invalid local review history');
  return data;
}

export function recordReviewCompletions(history: ReviewHistory, completions: ReviewCompletion[], now: number): ReviewHistory {
  let next = history;
  for (const role of roles) {
    const previous = history[role];
    const seen = { ...previous.seen };
    let added = 0;
    for (const item of completions) {
      if (item.role !== role || !item.tripId || !Number.isFinite(item.completedAt)
        || item.completedAt <= previous.ignoredBefore || item.completedAt > now) continue;
      const key = `trip:${item.tripId}`;
      if (Object.hasOwn(seen, key)) continue;
      seen[key] = item.completedAt;
      added += 1;
    }
    if (!added) continue;
    let ignoredBefore = previous.ignoredBefore;
    const entries = Object.entries(seen);
    if (entries.length > MAX_REVIEW_RECEIPTS) {
      entries.sort((a, b) => a[1] - b[1]);
      ignoredBefore = entries[entries.length - MAX_REVIEW_RECEIPTS - 1][1];
      // Advance a watermark as well as pruning IDs: old cached trips cannot be counted again.
      for (const [id, date] of entries) if (date <= ignoredBefore) delete seen[id];
    }
    next = { ...next, [role]: { ...previous, seen, ignoredBefore, count: previous.count + added } };
  }
  return next;
}

export function nextReviewMilestone(promptedCount: number): number {
  return promptedCount === 0 ? 1 : (Math.floor(promptedCount / 10) + 1) * 10;
}

export function reviewIsDue(history: ReviewHistory, now: number): boolean {
  return history.attempts.filter(time => time > now - REVIEW_YEAR_MS).length < MAX_REVIEW_ATTEMPTS
    && roles.some(role => history[role].count >= nextReviewMilestone(history[role].promptedCount));
}

export function reserveReviewAttempt(history: ReviewHistory, now: number): ReviewHistory {
  if (!reviewIsDue(history, now)) return history;
  // Coalesce reached milestones, including both roles, into ONE solicitation.
  return { ...history, attempts: [...history.attempts.filter(time => time > now - REVIEW_YEAR_MS), now],
    passenger: { ...history.passenger, promptedCount: history.passenger.count },
    driver: { ...history.driver, promptedCount: history.driver.count } };
}
