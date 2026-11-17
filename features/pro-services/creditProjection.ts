/** Informative only: never used to charge a wallet or to change contract terms. */
export type CreditProjectionInput = {
  remainingMinor: number;
  repaymentBps: number;
  weeklyRevenueMinor: number;
  weeklyExtraMinor: number;
};

export function parseProjectionFc(input: string): number | null {
  const value = input.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(\.\d)?$/.test(value)) return null;
  const minor = Math.round(Number(value) * 100);
  return Number.isSafeInteger(minor) && minor >= 0 && minor <= 1e12 ? minor : null;
}

/** Avoid multiplying large monetary integers before dividing. Round down to wallet precision. */
export function projectedDeduction(minor: number, bps: number): number {
  const whole = Math.floor(minor / 10000) * bps;
  const fraction = Math.floor((minor % 10000) * bps / 10000);
  return Math.floor((whole + fraction) / 10) * 10;
}

export function projectCredit(input: CreditProjectionInput) {
  const { remainingMinor, repaymentBps, weeklyRevenueMinor, weeklyExtraMinor } = input;
  if (![remainingMinor, weeklyRevenueMinor, weeklyExtraMinor].every(n =>
    Number.isSafeInteger(n) && n >= 0 && n <= 1e12)
    || !Number.isInteger(repaymentBps) || repaymentBps < 1 || repaymentBps > 9500) return null;
  const fromTripsMinor = projectedDeduction(weeklyRevenueMinor, repaymentBps);
  const weeklyMinor = fromTripsMinor + weeklyExtraMinor;
  if (remainingMinor === 0) return { weeks: 0, fromTripsMinor, weeklyMinor: 0, lastMinor: 0, checkpoints: [] };
  if (weeklyMinor === 0) return { weeks: null, fromTripsMinor, weeklyMinor, lastMinor: 0, checkpoints: [] };
  const weeks = Math.ceil(remainingMinor / weeklyMinor);
  // Bounded rendering, even for a very long repayment period.
  const periods = [...new Set([1, 4, 13, 26, weeks].filter(n => n <= weeks))].sort((a, b) => a - b);
  return {
    weeks, fromTripsMinor, weeklyMinor: Math.min(weeklyMinor, remainingMinor),
    lastMinor: remainingMinor - (weeks - 1) * weeklyMinor,
    checkpoints: periods.map(week => ({
      week, paidMinor: Math.min(remainingMinor, week * weeklyMinor),
      remainingMinor: Math.max(0, remainingMinor - week * weeklyMinor),
    })),
  };
}
