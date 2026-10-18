/**
 * Syntax check only: the OTP provider validates country/operator support.
 * Keep account identifiers unchanged; legacy accounts are looked up by the
 * exact phone entered at signup, not by a canonical E.164 database column.
 */
export function isAuthPhoneValid(phone: string): boolean {
  const compact = phone.trim().replace(/[\s().-]/g, '');
  if (compact.startsWith('+') || compact.startsWith('00')) {
    const international = compact.slice(compact.startsWith('+') ? 1 : 2);
    return /^[1-9]\d{6,14}$/.test(international);
  }

  // Preserve local RDC numbers and existing digits-only account identifiers.
  // Foreign numbers must explicitly include + or 00 to avoid RDC inference.
  return /^\d{9,15}$/.test(compact)
    && (!compact.startsWith('0') || compact.length <= 13);
}

export const authPhoneCopy = {
  hint: 'Numéro étranger ? Ajoutez l’indicatif (+33, +32…).',
  invalid: 'Saisissez un numéro valide. Pour un numéro étranger, ajoutez + ou 00 suivi de l’indicatif du pays.',
} as const;
