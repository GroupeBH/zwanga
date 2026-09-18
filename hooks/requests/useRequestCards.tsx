import { RequestListCard } from '@/features/requests/RequestListCard';
import type { TripRequest } from '@/types';
import React, { useCallback } from 'react';

interface Params {
  handleRequestPress: (requestId: string) => void;
  isDriverAccount: boolean;
}

export function useRequestCards({ handleRequestPress, isDriverAccount }: Params) {
  const renderAvailableRequestCard = useCallback(({ item }: { item: TripRequest }) => (
    <RequestListCard request={item} onOpen={handleRequestPress} canAccept={isDriverAccount} />
  ), [handleRequestPress, isDriverAccount]);
  const renderMyRequestCard = useCallback(({ item }: { item: TripRequest }) => (
    <RequestListCard request={item} onOpen={handleRequestPress} own />
  ), [handleRequestPress]);
  return { renderAvailableRequestCard, renderMyRequestCard };
}
