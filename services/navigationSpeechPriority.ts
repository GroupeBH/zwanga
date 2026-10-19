// No native imports: navigation keeps its existing foreground/background policy.
let revision = 0;
let cancelAnnouncement: (() => Promise<void>) | undefined;
export const getNavigationSpeechRevision = () => revision;

export function registerRideSpeechInterruption(cancel: () => Promise<void>) {
  cancelAnnouncement = cancel;
  return () => { if (cancelAnnouncement === cancel) cancelAnnouncement = undefined; };
}

/** Cancels only a ride alert owned by the foreground announcer, not GPS speech. */
export function interruptRideSpeechForNavigation(): Promise<void> | undefined {
  revision++;
  return cancelAnnouncement?.();
}
