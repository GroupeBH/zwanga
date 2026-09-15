

export const DRC_MOBILE_MONEY_PREFIX = '+243';

export const DRC_MOBILE_MONEY_REGEX = /^\+243\d{9}$/;

export const normalizePaymentPhone = (value?: string | null) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return trimmed.startsWith('+') ? '+' : '';
  }

  return trimmed.startsWith('+') ? `+${digits}` : digits;
};

export const formatCongolesePaymentPhone = (value?: string | null) => {
  const normalized = normalizePaymentPhone(value);
  if (!normalized) return '';

  const digits = normalized.replace(/\D/g, '');
  if (digits.startsWith('243') && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return `${DRC_MOBILE_MONEY_PREFIX}${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `${DRC_MOBILE_MONEY_PREFIX}${digits}`;
  }

  return normalized;
};

export const isValidCongolesePaymentPhone = (value?: string | null) =>
  DRC_MOBILE_MONEY_REGEX.test(formatCongolesePaymentPhone(value));
