import { baseApi } from './baseApi';
import { paymentInbox } from '@/features/driver-payments/paymentInbox';
import type { DriverPaymentNotice } from '@/features/driver-payments/paymentNoticeModel';

export const driverPaymentApi = baseApi.injectEndpoints({ endpoints: builder => ({
  getDriverPaymentNotices: builder.query<DriverPaymentNotice[], string>({
    // Cache is account-scoped; server identity comes exclusively from the token.
    async queryFn(userId, _api, _extra, baseQuery) {
      const result = await baseQuery('/notifications/driver-payments');
      if (result.error) return { error: result.error };
      try { return { data: paymentInbox(result.data, userId) }; }
      catch { return { error: { status: 'CUSTOM_ERROR', error: 'Paiements indisponibles.' } }; }
    },
    keepUnusedDataFor: 30,
    providesTags: [{ type: 'Notification', id: 'DRIVER_PAYMENTS' }],
  }),
}) });
export const { useGetDriverPaymentNoticesQuery } = driverPaymentApi;
