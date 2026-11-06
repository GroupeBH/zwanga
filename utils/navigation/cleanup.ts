import { warnThrottled } from '@/utils/throttledWarning';

/** Best-effort teardown must not prevent the remaining resources or UI from closing. */
export function runNavigationCleanup(cleanup: () => unknown): void {
  const failed = () => warnThrottled('[NavigationCleanup] Arrêt partiel ; poursuite de la fermeture.');
  try {
    void Promise.resolve(cleanup()).catch(failed);
  } catch {
    failed();
  }
}
