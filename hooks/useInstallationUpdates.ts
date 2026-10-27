import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { readInstalledApp } from '@/features/app-updates/nativeVersion';
import { useSyncInstallationUpdatesMutation } from '@/store/api/installationUpdatesApi';
import { announcementPreference, getAnnouncementIdentity, loadAnnouncementPreference, nextAnnouncementSequence, subscribeAnnouncementPreference } from '@/services/installationAnnouncements';
import { obtainFcmToken, subscribeToFcmRefresh } from '@/services/pushNotifications';
import { createPushRegistrationAttempt } from '@/services/pushRegistrationAttempt';

/** Installation-only, no account/profile lookup and no OS permission dialog. */
export function useInstallationUpdates() {
  const preference = useSyncExternalStore(subscribeAnnouncementPreference, announcementPreference, announcementPreference);
  const active = useAppIsActive();
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const installed = useMemo(readInstalledApp, []);
  const [syncInstallation] = useSyncInstallationUpdatesMutation();
  const last = useRef({ key: '', at: 0 });
  useEffect(() => { if (active) void loadAnnouncementPreference().catch(() => {}); }, [active]);
  useEffect(() => {
    if (!active || !online || !installed || !preference.loaded || !preference.chosen) return;
    let stopped = false, running: ReturnType<typeof createPushRegistrationAttempt> | null = null;
    let retry = true, rotated = false;
    const sync = async () => {
      if (stopped || running) return;
      const attempt = createPushRegistrationAttempt(); running = attempt;
      const valid = () => !stopped && attempt.current() && announcementPreference().revision === preference.revision;
      try {
        rotated = false;
        const identity = await attempt.wait(getAnnouncementIdentity);
        const sequence = await attempt.wait(nextAnnouncementSequence);
        const permission = preference.enabled ? await attempt.wait(() => Notifications.getPermissionsAsync()) : null;
        const allowed = permission?.status === 'granted';
        const token = allowed ? await attempt.wait(() => obtainFcmToken({ requestPermission: false })) : null;
        if (!valid()) return;
        // A transport/native lookup failure is not a withdrawal of consent.
        if (preference.enabled && allowed && !token) { retry = true; return; }
        // Revoked OS permission disables delivery too; try again on next resume.
        const enabled = preference.enabled && allowed;
        const key = `${preference.revision}:${enabled}:${token ?? ''}:${installed.version}:${installed.build}`;
        if (key === last.current.key && Date.now() - last.current.at < 24 * 60 * 60_000) { retry = false; return; }
        const request = syncInstallation({ ...installed, id: identity.id, sequence, enabled, ...(token ? { pushToken: token } : {}) });
        try {
          const response = await attempt.wait(() => request.unwrap(), () => request.abort());
          if (valid() && response.registered && response.enabled === enabled) { last.current = { key, at: Date.now() }; retry = false; }
        } finally { request.reset(); }
      } catch { retry = true; }
      finally { attempt.finish(); if (running === attempt) running = null; if (!stopped && rotated) void sync(); }
    };
    const initial = setTimeout(() => { void sync(); }, 1500);
    const timer = setInterval(() => { if (retry || Date.now() - last.current.at >= 24 * 60 * 60_000) void sync(); }, 60_000);
    const unsubscribe = subscribeToFcmRefresh(() => { rotated = true; retry = true; void sync(); });
    return () => { stopped = true; running?.cancel(); clearTimeout(initial); clearInterval(timer); unsubscribe(); };
  }, [active, online, installed, preference, syncInstallation]);
}
