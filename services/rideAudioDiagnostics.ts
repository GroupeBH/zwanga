const reported = new Map<string, number>();
/** Static codes only: never log notification payloads, routes, tokens or users. */
export function reportRideAudioFailure(code: string) {
  if (!/^[A-Z][A-Z_]{2,63}$/.test(code)) return;
  if (Date.now() - (reported.get(code) ?? -Infinity) < 60_000) return;
  reported.set(code, Date.now());
  if (reported.size > 20) reported.delete(reported.keys().next().value!);
  console.warn('[RideAudio]', code);
  // Unexpected failures must be diagnosable in release without a user's logcat.
  // Permission/mute/expiry are expected states, not Crashlytics errors.
  // Lazy, optional and throttled; never attach the push payload or native error.
  if (/(?:FAILED|LOST)$/.test(code)) {
    void import('./diagnostics').then(({ reportUnexpectedError }) => {
      reportUnexpectedError(new Error(`RideAudio:${code}`));
    }).catch(() => undefined);
  }
}
export async function boundedRideAudio<T>(work: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('RIDE_AUDIO_TIMEOUT')), ms);
    })]);
  } finally { clearTimeout(timer); }
}
