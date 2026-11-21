import { useLocalSearchParams } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { CommerceProductScreen } from '@/features/pro-services/CommerceProductScreen';
export default function ProductRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAppSelector(selectUser);
  return <CommerceProductScreen key={`${user?.id}:${id}`} id={id} />;
}
