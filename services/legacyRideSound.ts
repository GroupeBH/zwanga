import { ridePlaybackDeadline } from '@/features/notifications/ridePlaybackDeadline';
import notifee from '@notifee/react-native';
import { getDriverAlertChannel } from './driverAlertChannel';
import { isAppActive } from './appActivity';

/** Older binaries: delegate audio policy to Android instead of a media player
 * that cannot inspect DND/ringer mode. Reuse the visible card and its actions. */
export async function legacyRideSound(episodeKey: string | undefined, current: () => boolean) {
  if (!episodeKey) throw new Error('RING_CARD_REQUIRED');
  const cards = await notifee.getDisplayedNotifications();
  const card = cards.find(item => item.notification.id === episodeKey)?.notification;
  const until = ridePlaybackDeadline(card?.data);
  if (!card || !Number.isFinite(until) || until <= Date.now()) throw new Error('RING_CARD_REQUIRED');
  const channelId = await getDriverAlertChannel();
  let removed = false, paused = true, failed = false;
  let work = Promise.resolve();
  const valid = () => !removed && current() && isAppActive() && Date.now() < until;
  const update = () => {
    work = work.catch(() => {}).then(async () => {
      if (!valid() || paused) return;
      await notifee.displayNotification({ ...card, android: { ...card.android, channelId,
        sound: 'driver_ring', onlyAlertOnce: false, loopSound: false, timeoutAfter: Math.max(1, until - Date.now()) } });
      if (!valid() || paused) await notifee.cancelNotification(episodeKey);
    });
    void work.catch(() => { failed = true; });
    return work;
  };
  const stop = () => { paused = true; void notifee.cancelNotification(episodeKey).catch(() => {}); };
  return { play: () => { if (paused && valid()) { paused = false; failed = false; void update(); } }, pause: stop,
    remove: () => { removed = true; stop(); },
    state: async () => failed || !valid() ? 'stopped' : paused ? 'paused' : 'playing' };
}
