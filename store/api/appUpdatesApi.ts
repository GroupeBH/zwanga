import { baseApi } from './baseApi';
import type { AppUpdateResponse, InstalledApp } from '@/features/app-updates/updatePolicy';

export const appUpdatesApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    getAppUpdate: builder.query<AppUpdateResponse, InstalledApp>({
      query: params => ({ url: '/app-updates/latest', params }),
      keepUnusedDataFor: 3600,
      providesTags: ['AppUpdate'],
    }),
    registerAppUpdateClient: builder.mutation<{ registered: boolean }, InstalledApp & { pushToken?: string }>({
      query: body => ({ url: '/app-updates/client', method: 'POST', body }),
    }),
  }),
});
export const { useGetAppUpdateQuery, useRegisterAppUpdateClientMutation } = appUpdatesApi;
