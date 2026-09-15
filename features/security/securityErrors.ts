import { getApiErrorMessage } from '@/utils/errorHelpers';

export const parseErrorMessage = (error: unknown, fallback: string): string => {
  return getApiErrorMessage(error, fallback);
};
