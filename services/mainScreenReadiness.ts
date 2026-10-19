import { trackEvent } from './analytics';
import { getStartupElapsedMs } from './diagnostics';

export type MainScreen = 'home' | 'driver_navigation' | 'passenger_navigation' | 'request_detail';
let reported = false;

/** JS startup to first laid-out usable main screen, not native launch/GPS readiness. */
export function reportMainScreenReady(screen: MainScreen) {
  if (reported) return;
  reported = true;
  void trackEvent('app_main_screen_ready', { elapsed_ms: getStartupElapsedMs(), screen }).catch(() => {});
}
