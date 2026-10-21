import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { ensureNearbyDriverLocation, isNearbyDriverLocationEnabled,
  setNearbyDriverLocationEnabled } from '@/services/nearbyDriverLocation';
import { requestLocationPermission, waitForLocationPermission as wait } from '@/services/locationPermissionWait';

export function useNearbyLocationPermission(options: {
  userId?: string; driver: boolean; active: boolean; available: boolean;
  deferTrackingToCoordinator?: boolean;
}) {
  const [, update] = useState(0);
  const [attempt, retry] = useState(0);
  const version = getTokenSessionVersion();
  const entry = useMemo(() => ({ userId: options.userId, driver: options.driver, version, mounted: true,
    enabled: true, permission: false, foregroundPermission: false, loaded: false, loadError: false, consent: false,
    busy: false, settingsRequired: false, pendingSettings: false, message: '', readEpoch: 0, checkAfterAction: false,
    action: null as AbortController | null, read: null as AbortController | null,
  }), [options.userId, version, options.driver]);
  const latest = useRef({ entry, options }); latest.current = { entry, options };
  const current = useCallback(() => entry.mounted && latest.current.entry === entry &&
    entry.version === getTokenSessionVersion() && Boolean(entry.userId) && latest.current.options.driver, [entry]);
  const touch = useCallback(() => { if (current()) update(value => value + 1); }, [current]);
  useEffect(() => {
    entry.mounted = true;
    return () => { entry.mounted = false; entry.pendingSettings = false; entry.action?.abort(); entry.read?.abort(); };
  }, [entry]);

  const confirm = useCallback(async (controller: AbortController) => {
    const valid = () => current() && entry.action === controller && !controller.signal.aborted;
    if (!valid() || !entry.consent || !latest.current.options.available) return;
    await wait(setNearbyDriverLocationEnabled(entry.userId!, true, entry.version, valid), controller.signal);
    if (!valid()) return;
    const saved = await wait(isNearbyDriverLocationEnabled(entry.userId!), controller.signal);
    if (!valid()) return;
    entry.enabled = saved; entry.permission = true; entry.settingsRequired = false; entry.loaded = true;
    entry.consent = false; entry.message = saved ? 'Autorisation enregistrée.' : 'Activation non enregistrée. Réessayez.';
    if (saved && !latest.current.options.deferTrackingToCoordinator && AppState.currentState === 'active') {
      const started = await wait(ensureNearbyDriverLocation(entry.userId!, valid), controller.signal);
      if (valid() && !started) entry.message = 'L’envoi n’a pas encore démarré. Vérifiez le GPS ou réessayez après votre trajet.';
    }
  }, [current, entry]);

  const finish = useCallback((controller: AbortController) => {
    if (entry.action !== controller) return;
    controller.abort(); entry.action = null; entry.busy = false;
    if (current() && entry.checkAfterAction) retry(value => value + 1);
    touch();
  }, [current, entry, touch]);

  useEffect(() => {
    if (!options.active || !options.driver || !entry.userId) return;
    if (entry.action) { entry.checkAfterAction = true; return; }
    const controller = new AbortController(); entry.read = controller;
    const epoch = ++entry.readEpoch;
    const valid = () => !controller.signal.aborted && current() && epoch === entry.readEpoch;
    entry.loadError = false; touch();
    void (async () => {
      try {
        const [enabled, foreground, background] = await wait(Promise.all([
          isNearbyDriverLocationEnabled(entry.userId!), Location.getForegroundPermissionsAsync(),
          Location.getBackgroundPermissionsAsync(),
        ]), controller.signal);
        if (!valid()) return;
        const permission = foreground.granted && background.granted;
        if (entry.permission !== permission || entry.enabled !== enabled) entry.message = '';
        entry.enabled = enabled; entry.permission = permission; entry.foregroundPermission = foreground.granted;
        entry.settingsRequired = !foreground.granted ? foreground.canAskAgain === false
          : !background.granted && background.canAskAgain === false;
        entry.loaded = true;
        if (entry.pendingSettings && !entry.action) {
          entry.pendingSettings = false;
          if (entry.permission && entry.consent && latest.current.options.available) {
            // An active/inactive transition must not cancel a validated save.
            const action = new AbortController(); entry.action = action; entry.busy = true; touch();
            try { await confirm(action); }
            catch { if (current() && !action.signal.aborted) entry.message = 'Impossible de terminer. Réessayez.'; }
            finally { finish(action); }
          } else entry.message = entry.permission
            ? 'Autorisation du téléphone accordée. Réessayez l’activation quand le service sera disponible.'
            : 'Pas encore autorisé. Vous pouvez continuer à utiliser l’application.';
        }
      } catch {
        if (valid()) { entry.loadError = true; entry.loaded = false; }
      } finally { if (valid()) touch(); }
    })();
    return () => { controller.abort(); };
  }, [entry, current, touch, confirm, finish, options.active, options.driver, attempt]);

  const authorize = async (allowSettingsRedirect = false) => {
    if (!current() || !latest.current.options.active || !latest.current.options.available ||
      !entry.loaded || !entry.consent || entry.action) return;
    entry.readEpoch++; entry.read?.abort(); entry.checkAfterAction = false;
    const controller = new AbortController(); entry.action = controller;
    const valid = () => current() && entry.action === controller && !controller.signal.aborted;
    entry.busy = true; entry.message = ''; touch();
    const settings = async () => {
      if (!valid()) return;
      entry.settingsRequired = true;
      if (!allowSettingsRedirect) { entry.message = 'Le téléphone demande de terminer dans les autorisations de Zwanga.'; return; }
      entry.pendingSettings = true;
      try { await wait(Linking.openSettings(), controller.signal); }
      catch (error) { if (valid()) entry.pendingSettings = false; throw error; }
    };
    try {
      let foreground = await wait(Location.getForegroundPermissionsAsync(), controller.signal);
      if (!valid()) return;
      entry.foregroundPermission = foreground.granted;
      if (!foreground.granted) entry.permission = false;
      if (!foreground.granted && foreground.canAskAgain === false) { await settings(); return; }
      if (!foreground.granted) foreground = await wait(requestLocationPermission(() => Location.requestForegroundPermissionsAsync()), controller.signal, null);
      if (!valid()) return;
      entry.foregroundPermission = foreground.granted;
      if (!foreground.granted) {
        entry.settingsRequired = foreground.canAskAgain === false;
        entry.message = 'Position non autorisée. Les demandes restent accessibles dans l’application.'; return;
      }
      let background = await wait(Location.getBackgroundPermissionsAsync(), controller.signal);
      if (!valid()) return;
      entry.permission = background.granted;
      if (!background.granted && background.canAskAgain === false) { await settings(); return; }
      if (!background.granted) background = await wait(requestLocationPermission(() => Location.requestBackgroundPermissionsAsync()), controller.signal, null);
      if (!valid()) return;
      entry.permission = background.granted;
      if (!background.granted) {
        entry.settingsRequired = background.canAskAgain === false;
        entry.message = 'Pas encore autorisé. Les demandes restent accessibles dans l’application.'; return;
      }
      await confirm(controller);
    } catch (error) {
      if (valid()) entry.message = error instanceof Error && error.message === 'LOCATION_PERMISSION_PROMPT_PENDING'
        ? 'Fermez d’abord la fenêtre d’autorisation du téléphone, puis réessayez.'
        : 'Impossible de terminer. Vérifiez les réglages du téléphone, puis réessayez.';
    } finally { finish(controller); }
  };
  const disable = async () => {
    if (!current() || !latest.current.options.active || !entry.loaded || entry.action) return;
    entry.readEpoch++; entry.read?.abort(); entry.checkAfterAction = false;
    const controller = new AbortController(); entry.action = controller;
    const valid = () => current() && entry.action === controller && !controller.signal.aborted;
    entry.busy = true; entry.message = ''; entry.pendingSettings = false; touch();
    try {
      await wait(setNearbyDriverLocationEnabled(entry.userId!, false, entry.version, valid), controller.signal);
      if (!valid()) return;
      const enabled = await wait(isNearbyDriverLocationEnabled(entry.userId!), controller.signal);
      if (!valid()) return;
      entry.enabled = enabled; entry.consent = false;
      entry.message = 'Le suivi hors trajet est désactivé. Le suivi d’un trajet en cours reste inchangé.';
    } catch { if (valid()) entry.message = 'Impossible de désactiver. Réessayez.'; }
    finally { finish(controller); }
  };
  const defer = () => {
    if (!current()) return;
    entry.readEpoch++; entry.read?.abort(); entry.action?.abort(); entry.action = null;
    entry.busy = false; entry.consent = false; entry.pendingSettings = false; entry.checkAfterAction = false;
    if (!entry.loaded) entry.loadError = true;
    entry.message = 'Vous pouvez continuer. Vous pourrez autoriser la localisation plus tard.'; touch();
  };
  return {
    enabled: entry.enabled, permission: entry.permission, loaded: entry.loaded, loadError: entry.loadError,
    foregroundPermission: entry.foregroundPermission, consent: entry.consent, busy: entry.busy,
    settingsRequired: entry.settingsRequired, message: entry.message,
    setConsent: (checked: boolean) => {
      if (!current() || entry.action || !latest.current.options.active) return;
      entry.consent = checked; if (!checked) entry.pendingSettings = false; touch();
    },
    retry: () => { if (current() && !entry.action) retry(value => value + 1); },
    authorize: () => authorize(), openSettings: () => authorize(true), disable, defer,
  };
}
