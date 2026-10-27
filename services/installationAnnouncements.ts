import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const PREFERENCE_KEY = 'zwanga.installation-announcements.v1';
const IDENTITY_KEY = 'zwanga.installation-announcements.identity.v1';
const SEQUENCE_KEY = 'zwanga.installation-announcements.sequence.v1';
type Preference = { loaded: boolean; enabled: boolean; chosen: boolean; revision: number };
let snapshot: Preference = { loaded: false, enabled: false, chosen: false, revision: 0 };
const listeners = new Set<() => void>();
let hydration: Promise<void> | null = null;
let identity: Promise<{ id: string; secret: string }> | null = null;
let writes = Promise.resolve();
const publish = (value: Preference) => { snapshot = value; for (const listener of listeners) listener(); };
export const announcementPreference = () => snapshot;
export const subscribeAnnouncementPreference = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function loadAnnouncementPreference(): Promise<void> {
  if (snapshot.loaded) return Promise.resolve();
  return hydration ?? (hydration = (async () => {
    const raw = await AsyncStorage.getItem(PREFERENCE_KEY);
    publish({ loaded: true, enabled: raw === 'true', chosen: raw === 'true' || raw === 'false', revision: snapshot.revision });
  })().finally(() => { hydration = null; }));
}
export function setAnnouncementPreference(enabled: boolean): Promise<void> {
  const next = writes.then(async () => {
    await loadAnnouncementPreference();
    // Durable intent first: failed writes must not claim consent was saved.
    await AsyncStorage.setItem(PREFERENCE_KEY, String(enabled));
    publish({ loaded: true, enabled, chosen: true, revision: snapshot.revision + 1 });
  });
  writes = next.catch(() => {});
  return next;
}
export function getAnnouncementIdentity() {
  if (identity) return identity;
  identity = (async () => {
    const raw = await SecureStore.getItemAsync(IDENTITY_KEY);
    if (raw) {
      const value = JSON.parse(raw) as { id: string; secret: string };
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) && /^[0-9a-f]{64}$/i.test(value.secret)) return value;
      // Do not silently replace a damaged credential and orphan its consent.
      throw new Error('INSTALLATION_IDENTITY_INVALID');
    }
    const value = { id: Crypto.randomUUID(), secret: Crypto.randomUUID().replace(/-/g, '') + Crypto.randomUUID().replace(/-/g, '') };
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(value));
    return value;
  })().catch(error => { identity = null; throw error; });
  return identity;
}

/** Orders opt-outs and token rotations, even if an aborted HTTP request arrives late. */
export function nextAnnouncementSequence(): Promise<number> {
  const next = writes.then(async () => {
    const previous = Number(await AsyncStorage.getItem(SEQUENCE_KEY));
    const sequence = Math.max(Date.now(), Number.isSafeInteger(previous) ? previous + 1 : 1);
    await AsyncStorage.setItem(SEQUENCE_KEY, String(sequence));
    return sequence;
  });
  writes = next.then(() => {}, () => {});
  return next;
}
