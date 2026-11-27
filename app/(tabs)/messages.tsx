import { Redirect } from 'expo-router';

// Keep legacy links working without exposing a sixth tab.
export default function MessagesRedirect() {
  return <Redirect href="/notifications?section=messages" />;
}
