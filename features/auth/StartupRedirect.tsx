import { shouldResumeAuthFlow } from '@/services/authFlowDraft';
import { useAppSelector } from '@/store/hooks';
import { selectHasAuthenticatedSession } from '@/store/selectors';
import { Redirect } from 'expo-router';

/** ReduxProvider has already restored SecureStore before this route can mount. */
export default function StartupRedirect() {
  const hasSession = useAppSelector(selectHasAuthenticatedSession);
  // Optional presentation flags must never override an authenticated session.
  return <Redirect href={hasSession ? '/(tabs)' : shouldResumeAuthFlow() ? '/auth' : '/auth-entry'} />;
}
