import { useLocalSearchParams } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { CommerceContractScreen } from '@/features/pro-services/CommerceContractScreen';
export default function ContractRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAppSelector(selectUser);
  return <CommerceContractScreen key={`${user?.id}:${id}`} id={id} />;
}
