export const otpDigits = (text: string) => text.replace(/\D/g, '');

/** A complete code always starts at the first box, regardless of focused input. */
export function applyOtpInput(code: string[], text: string, index: number) {
  const digits = otpDigits(text);
  const next = [...code];
  if (!digits) next[index] = '';
  else if (digits.length >= code.length) return { code: digits.slice(0, code.length).split(''), focusNext: false };
  else for (let offset = 0; offset < digits.length && index + offset < code.length; offset++) next[index + offset] = digits[offset];
  // Never move focus while the OS is applying a paste/autofill operation.
  return { code: next, focusNext: digits.length === 1 && index < code.length - 1 };
}
