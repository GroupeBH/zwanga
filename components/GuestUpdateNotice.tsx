import { Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppUpdate } from '@/hooks/useAppUpdate';

/** In-app fallback for visitors who decline push; never displays a network error. */
export function GuestUpdateNotice() {
  const update = useAppUpdate(), router = useRouter();
  if (!update.release) return null;
  return <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/app-update')}
    style={{ paddingVertical: 12, minHeight: 44 }}>
    <Text style={{ color: '#B83E0E', fontWeight: '600', textAlign: 'center' }}>Nouvelle version disponible · Voir la mise à jour</Text>
  </TouchableOpacity>;
}
