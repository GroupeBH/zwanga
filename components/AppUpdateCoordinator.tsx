import { useAppUpdateClient } from '@/hooks/useAppUpdateClient';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { selectHasAuthenticatedSession } from '@/store/selectors';

export function AppUpdateCoordinator() {
  const hasSession = useAppSelector(selectHasAuthenticatedSession);
  const userId = useAppSelector(state => state.auth.user?.id);
  useAppUpdateClient(hasSession ? userId : undefined, useAppIsActive());
  return null;
}
