const reported = new Map<string, number>();
/** Static codes only: never log notification payloads, routes, tokens or users. */
export function reportRideAudioFailure(code: string) {
  if (Date.now() - (reported.get(code) ?? -Infinity) < 60_000) return;
  reported.set(code, Date.now());
  if (reported.size > 20) reported.delete(reported.keys().next().value!);
  console.warn('[RideAudio]', code);
}
export async function boundedRideAudio<T>(work: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('RIDE_AUDIO_TIMEOUT')), ms);
    })]);
  } finally { clearTimeout(timer); }
}
