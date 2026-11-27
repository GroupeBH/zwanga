import React from 'react';
import type { Booking } from '@/types';
import { useAppSelector } from '@/store/hooks';
import { displayReadOptions } from '@/hooks/useDisplayReads';
import { useBookingPaymentOptionsQuery } from '@/store/api/driverFinanceApi';
import { RidePaymentNoticeView } from './RidePaymentNoticeView';
import { ridePaymentNotice } from './ridePaymentNoticeModel';

/** Read-only: no mode change, cash exception consumption, or payment from this reminder. */
export function RidePaymentNotice({ booking, active, offline = false }: {
  booking?: Booking | null; active: boolean; offline?: boolean;
}) {
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const userId = useAppSelector(state => state.auth.user?.id);
  const eligible = Boolean(booking && ['accepted', 'completed'].includes(booking.status));
  const enabled = Boolean(active && online && !offline && userId && eligible);
  const read = useBookingPaymentOptionsQuery(booking?.id ?? '', displayReadOptions(enabled));
  // currentData belongs to this booking. Never display the previous booking's options,
  // or turn an API failure/offline cache into permission to pay cash.
  const options = enabled && !read.isFetching && !read.isError ? read.currentData : undefined;
  if (!booking || !eligible || !userId) return null;
  return <RidePaymentNoticeView notice={ridePaymentNotice(booking, options, offline || !online)} />;
}
