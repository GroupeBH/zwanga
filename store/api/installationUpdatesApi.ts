import type { InstalledApp } from '@/features/app-updates/updatePolicy';
import { baseApi, publicBaseQuery } from './baseApi';
import { getAnnouncementIdentity } from '@/services/installationAnnouncements';

type Input = InstalledApp & { id: string; sequence: number; enabled: boolean; pushToken?: string };
const api = baseApi.injectEndpoints({ endpoints: builder => ({
  syncInstallationUpdates: builder.mutation<{ registered: boolean; enabled: boolean }, Input>({
    // No account token or refresh: subscription must also work before signup.
    queryFn: async ({ id, ...body }, api, extra) => {
      let secret: string;
      try {
        const identity = await getAnnouncementIdentity();
        if (identity.id !== id) return { error: { status: 'CUSTOM_ERROR', error: 'Installation non reconnue.' } };
        secret = identity.secret;
      } catch { return { error: { status: 'CUSTOM_ERROR', error: 'Enregistrement local indisponible.' } }; }
      const result = await publicBaseQuery({ url: `/app-updates/installations/${encodeURIComponent(id)}`, method: 'PUT', timeout: 15_000,
        headers: { 'x-installation-secret': secret }, body }, api, extra);
      return result.error ? { error: result.error } : { data: result.data as { registered: boolean; enabled: boolean } };
    },
  }),
}) });
export const { useSyncInstallationUpdatesMutation } = api;
