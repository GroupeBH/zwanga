/** Bounded foreground recovery. Call cancel on blur/unmount or a changed ride. */
export function retryGpsStart(start: (attempt: number) => Promise<boolean>) {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async (attempt: number) => {
    let started = false;
    try { started = await start(attempt); }
    catch { /* Retry transient native/storage errors, never surface an unhandled rejection. */ }
    if (!cancelled && !started && attempt < 3) {
      timer = setTimeout(() => { void run(attempt + 1); }, 30_000 * 2 ** attempt);
    }
  };
  void run(0);
  return () => { cancelled = true; clearTimeout(timer); };
}
