// Fixed labels only: never accept credentials, identifiers, locations or server errors.
export type StartupMilestone = 'login_started' | 'login_received' | 'login_failed'
  | 'login_request_failed' | 'login_session_failed'
  | 'session_saving' | 'session_saved' | 'session_save_failed'
  | 'restore_started' | 'restore_slow' | 'restore_ready' | 'restore_failed'
  | 'home_mounted' | 'home_map_mounted' | 'home_map_ready' | 'home_map_camera_failed';
type Entry = { phase: StartupMilestone; elapsedMs: number };
const startedAt = Date.now();
const pending: Entry[] = [];
let reporter: ((entry: Entry) => void) | null = null;

export function recordStartupMilestone(phase: StartupMilestone) {
  const entry = { phase, elapsedMs: Math.max(0, Date.now() - startedAt) };
  if (!reporter) {
    pending.push(entry);
    if (pending.length > 16) pending.shift();
    return;
  }
  try { reporter(entry); } catch { /* Optional diagnostics must never break login. */ }
}

export function setStartupDiagnosticReporter(next: (entry: Entry) => void) {
  reporter = next;
  for (const entry of pending.splice(0)) {
    try { next(entry); } catch { /* best effort */ }
  }
}
