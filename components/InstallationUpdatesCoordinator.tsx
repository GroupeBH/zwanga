import { useInstallationUpdates } from '@/hooks/useInstallationUpdates';
import { useUpdateNotificationOpen } from '@/hooks/useUpdateNotificationOpen';
export function InstallationUpdatesCoordinator() { useInstallationUpdates(); useUpdateNotificationOpen(); return null; }
