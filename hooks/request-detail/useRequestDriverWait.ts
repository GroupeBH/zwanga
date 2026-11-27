import { useEffect, useState } from 'react';

/** active includes screen focus, app foreground and connectivity at all three call sites. */
export function useRequestDriverWait(deadline: number | null, active: boolean): boolean {
  const [revision, tick] = useState(0);
  useEffect(() => {
    if (!active || deadline === null) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    // One wake-up at the threshold, not a countdown or a network polling loop.
    // Re-evaluate after a clock change and on foreground/focus recovery.
    const timer = setTimeout(() => tick(value => value + 1), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [active, deadline, revision]);
  return active && deadline !== null && Date.now() >= deadline;
}
