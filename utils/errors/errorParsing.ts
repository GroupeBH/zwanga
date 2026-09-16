

export function getErrorMessageText(error: any): string {
  if (!error) return '';

  const message =
    typeof error === 'string'
      ? error
      : error?.data?.message ??
        error?.data?.error?.message ??
        error?.data?.error ??
        error?.error?.message ??
        error?.error ??
        error?.message ??
        '';

  return Array.isArray(message) ? message.join(' ') : String(message);
}

export function getErrorStatus(error: any): number | string | undefined {
  const numericStatus = error?.data?.statusCode ?? error?.originalStatus;
  if (typeof numericStatus === 'number') {
    return numericStatus;
  }

  if (typeof numericStatus === 'string') {
    const parsedNumericStatus = Number.parseInt(numericStatus, 10);
    if (Number.isFinite(parsedNumericStatus)) {
      return parsedNumericStatus;
    }
  }

  const status = error?.status;
  if (typeof status === 'number') {
    return status;
  }

  if (typeof status === 'string') {
    const parsedStatus = Number.parseInt(status, 10);
    return Number.isFinite(parsedStatus) ? parsedStatus : status;
  }

  return undefined;
}

export function normalizeMessage(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(normalizeMessage).filter(Boolean).join('\n');
  }

  if (typeof value === 'string') {
    return value.trim().replace(/[ \t]+/g, ' ');
  }

  if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown; error?: unknown };
    return normalizeMessage(candidate.message ?? candidate.error);
  }

  return '';
}

export function getRawErrorMessage(error: any, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string') {
    return normalizeMessage(error);
  }

  return normalizeMessage(
    error?.data?.message ??
      error?.data?.error?.message ??
      error?.data?.error ??
      error?.error?.message ??
      error?.error ??
      error?.message ??
      fallback,
  );
}
