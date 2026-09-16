export const normalizeLegalName = (value?: string | null): string =>
  String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');

export const hasCompleteLegalIdentity = (
  firstName?: string | null,
  lastName?: string | null,
): boolean => Boolean(normalizeLegalName(firstName) && normalizeLegalName(lastName));
