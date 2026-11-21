// A primitive snapshot avoids useSyncExternalStore render loops. No GPS, API or
// permission prompt is started here; the existing ride coordinator remains owner.
let revision = 0;
const listeners = new Set<() => void>();
export function notifyLocationAccessChanged() {
  revision++;
  for (const listener of listeners) listener();
}
export const getLocationAccessRevision = () => revision;
export function subscribeLocationAccess(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
