

export const normalizeErrorMessage = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const getRtkErrorStatus = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return undefined;
  }

  return (error as { status?: number | string }).status;
};

export const getRtkErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const { data, error: errorMessage } = error as {
    data?: unknown;
    error?: unknown;
  };

  if (typeof data === 'string') {
    return data;
  }

  if (data && typeof data === 'object') {
    const message = (data as { message?: unknown; error?: unknown }).message;
    if (Array.isArray(message)) {
      return message.join(' ');
    }
    if (typeof message === 'string') {
      return message;
    }

    const dataError = (data as { error?: unknown }).error;
    if (typeof dataError === 'string') {
      return dataError;
    }
  }

  return typeof errorMessage === 'string' ? errorMessage : '';
};

export const shouldBackOffAfterBackgroundResponse = (status: number | string | undefined) =>
  status === 'FETCH_ERROR' ||
  status === 'TIMEOUT_ERROR' ||
  status === 408 ||
  status === 425 ||
  status === 429 ||
  (typeof status === 'number' && status >= 500);

export const isInactiveTripResponse = (status: number | string | undefined, message: string) =>
  status === 400 &&
  normalizeErrorMessage(message).includes('trajet doit etre actif');

export const isTerminalPassengerTrackingResponse = (
  status: number | string | undefined,
  message: string,
) => {
  if (status === 401 || status === 403 || status === 404) return true;
  if (status !== 400) return false;

  const normalizedMessage = normalizeErrorMessage(message);
  return (
    normalizedMessage.includes('reservations acceptees') ||
    normalizedMessage.includes('reservation acceptee')
  );
};
