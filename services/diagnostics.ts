import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { setStartupDiagnosticReporter } from './startupDiagnostics';

type CrashModule = typeof import('@react-native-firebase/crashlytics');
let moduleCache: CrashModule | null | undefined;
const startedAt = Date.now();
let currentScreen = 'startup';
const reportedSessionFailures = new Set<string>();

function getReporter() {
  if (__DEV__ || Platform.OS === 'web') return null;
  if (moduleCache === undefined) {
    try {
      // Lazy and optional in an older development client; release needs a native rebuild.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      moduleCache = require('@react-native-firebase/crashlytics') as CrashModule;
      moduleCache.getCrashlytics();
    } catch { moduleCache = null; }
  }
  return moduleCache;
}

export function initializeDiagnostics() {
  try {
    const reporter = getReporter();
    if (!reporter) return;
    void reporter.setAttributes(reporter.getCrashlytics(), {
      app_version: Constants.expoConfig?.version ?? 'unknown',
      app_build: Constants.nativeBuildVersion ?? 'unknown',
      device_model: Device.modelName ?? 'unknown',
      os_version: String(Platform.Version),
      screen: currentScreen,
    }).catch(() => undefined);
    setStartupDiagnosticReporter(({ phase, elapsedMs }) => {
      void reporter.setAttribute(reporter.getCrashlytics(), 'startup_phase', phase).catch(() => undefined);
      reporter.log(reporter.getCrashlytics(), `startup:${phase}:${elapsedMs}ms`);
      // Also report local session failures without requiring a fatal crash or
      // a tester's screenshot. Fixed labels only; no PIN, JWT or raw exception.
      if ((phase === 'session_save_failed' || phase === 'restore_failed') &&
          !reportedSessionFailures.has(phase)) {
        reportedSessionFailures.add(phase);
        reporter.recordError(reporter.getCrashlytics(), new Error(`AuthSession:${phase}`));
      }
    });
  } catch { /* Diagnostics must never prevent startup. */ }
}

export function recordDiagnosticScreen(screen: string) {
  currentScreen = screen;
  try {
    const reporter = getReporter();
    if (!reporter) return;
    void reporter.setAttribute(reporter.getCrashlytics(), 'screen', screen).catch(() => undefined);
    reporter.log(reporter.getCrashlytics(), `screen:${screen}`);
  } catch { /* best effort */ }
}

export function reportUnexpectedError(error: Error, componentStack?: string | null) {
  try {
    const reporter = getReporter();
    if (!reporter) return;
    if (componentStack) reporter.log(reporter.getCrashlytics(), componentStack.slice(0, 4000));
    reporter.recordError(reporter.getCrashlytics(), error);
  } catch { /* keep the error recovery UI usable */ }
}

export const getStartupElapsedMs = () => Date.now() - startedAt;
