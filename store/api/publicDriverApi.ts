import { baseApi, publicBaseQuery } from './baseApi';
import { isDriverQrId, type PublicDriverCard } from '@/features/driver-qr/driverQrModel';

export const publicDriverApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getPublicDriverCard: builder.query<PublicDriverCard, string>({
      async queryFn(id, api, extraOptions) {
        if (!isDriverQrId(id)) return { error: { status: 'CUSTOM_ERROR', error: 'Conducteur invalide.' } };
        const result = await publicBaseQuery({ url: `/public/drivers/${id}`, cache: 'no-store' }, api, extraOptions);
        if (result.error) return { error: result.error };
        return { data: result.data as PublicDriverCard };
      },
      keepUnusedDataFor: 0,
      providesTags: (_result, _error, id) => [{ type: 'User', id }],
    }),
  }),
});
export const { useGetPublicDriverCardQuery } = publicDriverApi;
