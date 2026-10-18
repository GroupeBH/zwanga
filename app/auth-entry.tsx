import { shouldResumeAuthFlow } from '@/services/authFlowDraft';
import { AuthWelcome } from '@/features/auth/AuthWelcome';
import { useAppSelector } from '@/store/hooks';
import { selectHasAuthenticatedSession } from '@/store/selectors';
import { Redirect } from 'expo-router';

export default function AuthEntryScreen() {
  const hasSession = useAppSelector(selectHasAuthenticatedSession);
  // Do not paint login/signup choices for a restored session, even for a direct link.
  return hasSession ? <Redirect href="/(tabs)" /> : shouldResumeAuthFlow() ? <Redirect href="/auth" /> : <AuthWelcome />;
}


