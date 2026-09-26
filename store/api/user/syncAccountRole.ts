import { getTokenSessionVersion } from '@/services/tokenSession';
import type { RootState } from '@/store';
import type { User } from '@/types';

// Reuse confirmed profile reads/mutations; no new request or subscription.
export async function syncAccountRole<T extends User | { user: User }>(
  _arg: unknown,
  lifecycle: {
    getState: () => unknown;
    dispatch: (action: any) => unknown;
    queryFulfilled: PromiseLike<{ data: T }>;
  },
) {
  const version = getTokenSessionVersion();
  const ownerId = (lifecycle.getState() as RootState).auth.user?.id;
  try {
    const { data } = await lifecycle.queryFulfilled;
    const user: User = 'user' in data ? data.user : data as User;
    const current = (lifecycle.getState() as RootState).auth.user;
    if (!ownerId || user.id !== ownerId || current?.id !== ownerId ||
      version !== getTokenSessionVersion()) return;
    // A late pre-activation response must not undo a more recent server snapshot.
    if (current.updatedAt && user.updatedAt && Date.parse(current.updatedAt) > Date.parse(user.updatedAt)) return;
    lifecycle.dispatch({ type: 'auth/updateUser', payload: {
      id: user.id, role: user.role, isDriver: user.role === 'driver' || user.role === 'both',
      driverOnboardingRequestedAt: user.driverOnboardingRequestedAt,
      driverActivatedAt: user.driverActivatedAt, updatedAt: user.updatedAt,
    } });
  } catch { /* RTK Query exposes the error; keep the confirmed role. */ }
}
