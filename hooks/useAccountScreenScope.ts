import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useWalletScreenScope } from '@/hooks/wallet/useWalletScreenScope';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';

/** Reuse the account/session lifecycle guard for non-wallet asynchronous UI actions. */
export function useAccountScreenScope() {
  const userId = useAppSelector(selectUser)?.id;
  return useWalletScreenScope(userId, useScreenIsActive());
}
