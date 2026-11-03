import type { User } from '@/types';
import { getTripUrl } from './notificationNavigation';

/** Match the whole path: `navigate/id` must never become a trip ID. */
export function getTripDeepLinkHref(url: string, user?: User) {
  const route = url.replace(/^zwanga:\/\//, '').replace(/^\/+/, '').split('#')[0];
  const [path, query = ''] = route.split('?');
  const match = /^trip\/(?:(manage|navigate)\/)?([a-zA-Z0-9_-]+)\/?$/.exec(path);
  if (!match || ['manage', 'navigate'].includes(match[2])) return null;
  const [, screen, id] = match;
  const values = new URLSearchParams(query);
  const params: Record<string, string> = {};
  // Preserve supported share/edit options, never navigator state or a query-supplied ID.
  for (const key of ['driverId', 'role', 'track', 'openEdit']) {
    const value = values.get(key);
    if (value) params[key] = value;
  }
  const pathname = screen === 'navigate' ? '/trip/navigate/[id]'
    : screen === 'manage' || getTripUrl(id, params, user).startsWith('/trip/manage/')
      ? '/trip/manage/[id]' : '/trip/[id]';
  return { pathname, params: { ...params, id } } as const;
}
