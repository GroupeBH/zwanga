import { baseApi, publicBaseQuery } from './baseApi';
import type { AppUpdateResponse, InstalledApp } from '@/features/app-updates/updatePolicy';

export const appUpdatesApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getAppUpdate: builder.query<AppUpdateResponse, InstalledApp>({
      queryFn: async (params, api, extra) => {
        const result = await publicBaseQuery({ url: '/app-updates/latest', params }, api, extra);
        return result.error ? { error: result.error } : { data: result.data as AppUpdateResponse };
      },
      keepUnusedDataFor: 3600,
      providesTags: ['AppUpdate'],
    }),
    registerAppUpdateClient: builder.mutation<{ registered: boolean }, InstalledApp & { pushToken?: string }>({
      query: body => ({ url: '/app-updates/client', method: 'POST', body }),
    }),
  }),
});
export const { useGetAppUpdateQuery, useRegisterAppUpdateClientMutation } = appUpdatesApi;
