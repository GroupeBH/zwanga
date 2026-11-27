import { InboxHeader } from '@/features/notifications/InboxHeader';
import { resolveInboxSection } from '@/features/notifications/inboxSections';
import { inboxStyles } from '@/features/notifications/inboxStyles';
import NotificationActivity from '@/features/notifications/NotificationActivity';
import MessagesInbox from '@/features/messages/MessagesInbox';
import { SupportInbox } from '@/features/notifications/SupportInbox';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useGetNotificationsQuery } from '@/store/api/notificationApi';
import { useAppSelector } from '@/store/hooks';
import { selectUnreadMessagesCount } from '@/store/selectors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotificationsScreen() {
  const router = useRouter();
  const active = useScreenIsActive();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const section = resolveInboxSection(params.section);
  const messages = useAppSelector(selectUnreadMessagesCount);
  const { data } = useGetNotificationsQuery({ limit: 1 }, {
    skip: !active, refetchOnMountOrArgChange: 30, refetchOnReconnect: true,
  });
  return <SafeAreaView style={inboxStyles.container}>
    <InboxHeader section={section} unreadActivity={data?.unreadCount ?? 0} unreadMessages={messages}
      onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
      onSelect={next => { if (active && next !== section) { Keyboard.dismiss(); router.setParams({ section: next }); } }} />
    {/* Only the selected workspace mounts: no hidden lists or background fetch loops. */}
    {section === 'activity' ? <NotificationActivity /> : section === 'support' ? <SupportInbox /> : <MessagesInbox />}
  </SafeAreaView>;
}
