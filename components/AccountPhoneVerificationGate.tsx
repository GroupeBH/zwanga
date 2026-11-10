import { useCallback, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { useSegments } from 'expo-router';
import { isAccountPhoneVerificationRequired } from '@/config/env';
import { accountPhoneGate } from '@/features/auth/accountPhoneVerification';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectHasAuthenticatedSession } from '@/store/selectors';
import { performLogout } from '@/store/slices/authSlice';
import { userApi, useGetCurrentUserQuery } from '@/store/api/userApi';
import { AccountPhoneVerification, PhoneVerificationShell, accountPhoneStyles as styles } from './auth/AccountPhoneVerification';

/** Keep the navigator mounted, but deny interaction until the server confirms ownership. */
export function AccountPhoneVerificationGate({ children }: { children: (blocked: boolean) => ReactNode }) {
  const authenticated = useAppSelector(selectHasAuthenticatedSession);
  const userId = useAppSelector(state => state.auth.tokenPayload?.sub ?? state.auth.tokenPayload?.userId ?? state.auth.user?.id) as string | undefined;
  const enabled = isAccountPhoneVerificationRequired && authenticated;
  const dispatch = useAppDispatch();
  const segments = useSegments();
  const profile = useGetCurrentUserQuery(undefined, { skip: !enabled,
    refetchOnMountOrArgChange: true, refetchOnReconnect: true });
  const user = profile.currentData?.id === userId ? profile.currentData : undefined;
  const status = accountPhoneGate({ enabled, authenticated, userId, profile: user });
  const blocked = status !== 'off' && status !== 'verified';
  // Auth owns signup finalization/KYC. No private feature is enabled during this exemption.
  const visible = blocked && segments[0] !== 'auth';
  const latest = useRef({ userId, enabled }); latest.current = { userId, enabled };
  const refreshProfile = useCallback(async () => {
    const version = getTokenSessionVersion();
    const current = () => latest.current.enabled && latest.current.userId === userId && version === getTokenSessionVersion();
    // Do not reuse a GET that started before the OTP mutation committed.
    const running = dispatch(userApi.util.getRunningQueryThunk('getCurrentUser', undefined));
    if (running) await running;
    if (!current()) return;
    const result = await dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { subscribe: false, forceRefetch: true })).unwrap();
    if (!current()) return;
    if (result.id !== userId || result.isPhoneVerified !== true) {
      throw new Error('La vérification du numéro n’est pas encore confirmée. Réessayez.');
    }
  }, [dispatch, userId]);
  const checking = status === 'checking' && !profile.isError && (profile.isFetching || profile.isUninitialized);

  return <>
    {children(blocked)}
    <Modal visible={visible} transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={() => {}}>
      <PhoneVerificationShell onLogout={() => dispatch(performLogout()).unwrap()}>
        {status === 'required' && user ? <AccountPhoneVerification key={`${user.id}:${user.phone}`}
          phone={user.phone} refreshProfile={refreshProfile} /> : <View style={styles.form}>
          <Text style={styles.title} accessibilityRole="header">{checking ? 'Un instant…' : 'Vérification indisponible'}</Text>
          <Text style={styles.body}>{checking ? 'Nous vérifions votre compte.' :
            'Impossible de vérifier votre compte. Réessayez avec une connexion internet.'}</Text>
          {checking ? <ActivityIndicator /> : <TouchableOpacity style={styles.primary} accessibilityRole="button"
            onPress={() => { void profile.refetch().unwrap().catch(() => {}); }}>
            <Text style={styles.primaryText}>Réessayer</Text>
          </TouchableOpacity>}
        </View>}
      </PhoneVerificationShell>
    </Modal>
  </>;
}
