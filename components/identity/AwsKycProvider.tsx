import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { randomUUID } from 'expo-crypto';
import { Colors } from '@/constants/styles';
import { AWS_KYC_CONSENT, AWS_KYC_DOCUMENT_LABELS, type AwsDocumentType, type AwsKycSession } from '@/features/identity/awsKycContracts';
import { captureAwsLiveness, cancelAwsLiveness } from '@/features/identity/awsLiveness';
import { awsKycPollingInterval } from '@/features/identity/kycDecision';
import { AWS_KYC_MOBILE_ENABLED } from '@/features/identity/kycProvider';
import { useCompleteAwsKycMutation, useCreateAwsKycMutation, useCurrentAwsKycQuery, useStartAwsLivenessMutation } from '@/store/api/awsKycApi';
import { userApi, useGetCurrentUserQuery } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { currentUserTag, kycStatusTag } from '@/store/api/user/identityContracts';
import type { DiditKycFlowOutcome } from '@/features/identity/diditFlowTypes';

const Context = createContext<() => Promise<DiditKycFlowOutcome | null>>(async () => null);
const deleteCameraFile = (uri: string) => {
  if (FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory))
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
};
export const useAwsKycFlow = () => useContext(Context);
export function AwsKycProvider({ children }: React.PropsWithChildren) {
  const [visible, setVisible] = useState(false);
  const resolve = useRef<((value: DiditKycFlowOutcome | null) => void) | null>(null);
  const userId = useAppSelector(s => s.auth.user?.id);
  const start = useCallback(() => new Promise<DiditKycFlowOutcome | null>(done => {
    if (!AWS_KYC_MOBILE_ENABLED) { done(null); return; }
    if (resolve.current) { done(null); return; }
    resolve.current = done; setVisible(true);
  }), []);
  const close = useCallback((outcome: DiditKycFlowOutcome | null) => {
    setVisible(false); resolve.current?.(outcome); resolve.current = null;
  }, []);
  useEffect(() => { close(null); }, [userId, close]);
  useEffect(() => () => { resolve.current?.(null); }, []);
  return <Context.Provider value={start}>{children}{visible && <AwsKycModal onClose={close} />}</Context.Provider>;
}

function AwsKycModal({ onClose }: { onClose: (result: DiditKycFlowOutcome | null) => void }) {
  const dispatch = useAppDispatch();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [type, setType] = useState<AwsDocumentType>('voter_card');
  const [images, setImages] = useState<{ front?: string; back?: string }>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newAttempt, setNewAttempt] = useState(false);
  const requestId = useRef(randomUUID());
  const [session, setSession] = useState<AwsKycSession>();
  const mounted = useRef(true), inFlight = useRef(false), files = useRef(new Set<string>());
  const authVersion = useRef(getTokenSessionVersion());
  const current = () => mounted.current && authVersion.current === getTokenSessionVersion();
  const { data: user } = useGetCurrentUserQuery();
  const state = useCurrentAwsKycQuery(undefined, { pollingInterval: awsKycPollingInterval(session, foreground, newAttempt), refetchOnMountOrArgChange: true });
  const [create, creation] = useCreateAwsKycMutation();
  const [start, credentials] = useStartAwsLivenessMutation();
  const [complete] = useCompleteAwsKycMutation();
  useEffect(() => {
    if (state.data && !newAttempt) setSession(previous => !previous || previous.id === state.data!.id ? state.data : previous);
  }, [state.data, newAttempt]);
  useEffect(() => {
    if (session?.status === 'approved' || session?.status === 'rejected')
      dispatch(userApi.util.invalidateTags([currentUserTag, kycStatusTag]));
  }, [dispatch, session?.id, session?.status]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    mounted.current = true;
    const cacheFiles = files.current;
    return () => {
      mounted.current = false;
      cancelAwsLiveness();
      for (const uri of cacheFiles) deleteCameraFile(uri);
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e: any) { if (current()) setError(typeof e?.data?.message === 'string' ? e.data.message : e?.message || 'Connexion interrompue. Réessayez sans quitter cet écran.'); }
    finally { if (current()) setBusy(false); inFlight.current = false; }
  };
  const photograph = (side: 'front' | 'back') => run(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Autorisez la caméra dans les réglages du téléphone.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false, allowsEditing: false });
    if (result.canceled) return;
    const original = result.assets[0].uri; files.current.add(original);
    if (!current()) { deleteCameraFile(original); return; }
    const asset = result.assets[0];
    const resized = await ImageManipulator.manipulateAsync(original, [{ resize: asset.width >= asset.height ? { width: Math.min(asset.width, 2000) } : { height: Math.min(asset.height, 2000) } }], { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
    files.current.add(resized.uri);
    if (!current()) { deleteCameraFile(original); deleteCameraFile(resized.uri); return; }
    if (current()) setImages(v => ({ ...v, [side]: resized.uri }));
  });
  const submit = () => run(async () => {
    if (!consent || !images.front || (type !== 'passport' && !images.back)) return;
    const body = new FormData();
    body.append('requestId', requestId.current); body.append('documentType', type);
    body.append('country', 'COD'); body.append('consentVersion', AWS_KYC_CONSENT);
    for (const side of ['front', 'back'] as const) if (images[side] && (side === 'front' || type !== 'passport'))
      body.append(side, { uri: images[side], type: 'image/jpeg', name: `${side}.jpg` } as any);
    try {
      const result = await create(body).unwrap();
      if (current()) { setSession(result); setNewAttempt(false); void state.refetch(); }
    } finally { creation.reset(); }
  });
  const capture = () => run(async () => {
    if (!session) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Autorisez la caméra pour continuer.');
    const input = await start(session.id).unwrap();
    credentials.reset();
    if (!current()) return;
    // RTK Query results are immutable; make no persistent copy and never log credentials.
    const result = await captureAwsLiveness(input);
    if (!current()) return;
    if (result === 'cancelled') setError('Capture interrompue. La session va expirer ; vous pourrez ensuite recommencer.');
    const latest = await complete(session.id).unwrap();
    if (current()) { setSession(latest); void state.refetch(); }
  });
  const finish = async () => {
    dispatch(userApi.util.invalidateTags([currentUserTag, kycStatusTag]));
    let kyc = null;
    if (session?.state === 'review' || session?.status === 'approved') {
      try { kyc = await dispatch(userApi.endpoints.getKycStatus.initiate(undefined, { forceRefetch: true, subscribe: false })).unwrap(); } catch { /* server owns status */ }
    }
    if (current()) onClose(kyc ? { kyc, status: kyc.status, sessionId: session?.id } : null);
  };
  const failed = session?.state === 'failed' || session?.status === 'rejected';
  const captureReady = session?.state === 'ready';
  const reviewing = session?.state === 'review' && session.status === 'pending';
  const approved = session?.status === 'approved';
  const canForm = newAttempt || (!session && !state.isFetching && (!state.error || ('status' in state.error && state.error.status === 404)));
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) void finish(); }}>
    <SafeAreaView style={styles.root}>
      <View style={styles.header}><Text style={styles.title}>Vérifier mon identité</Text><Pressable disabled={busy} onPress={() => void finish()} accessibilityLabel="Fermer"><Text style={styles.link}>Fermer</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>1. Votre pièce · 2. Selfie vidéo · 3. Vérification</Text>
        {canForm ? <>
          <Text style={styles.heading}>Une pièce officielle de RDC</Text>
          <Text style={styles.text}>Utilisez le document original, non expiré, bien éclairé et entièrement visible.</Text>
          <Text style={styles.text}>Votre identité est validée automatiquement si tous les contrôles sont concluants. En cas de doute, notre équipe examine votre dossier.</Text>
          {(Object.keys(AWS_KYC_DOCUMENT_LABELS) as AwsDocumentType[]).map(value => <Pressable key={value} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: type === value }} onPress={() => { setType(value); setImages({}); requestId.current = randomUUID(); }} style={[styles.choice, type === value && styles.selected]}><Text style={styles.text}>{AWS_KYC_DOCUMENT_LABELS[value]}</Text></Pressable>)}
          <Text style={styles.heading}>{user?.firstName} {user?.lastName}</Text>
          <Text style={styles.text}>Ces noms doivent être ceux de votre pièce, pas un pseudonyme. Fermez ce parcours pour les corriger dans votre profil si nécessaire.</Text>
          {(['front', ...(type === 'passport' ? [] : ['back'])] as ('front' | 'back')[]).map(side => <View key={side}>
            {images[side] && <Image source={{ uri: images[side] }} style={styles.preview} resizeMode="contain" />}
            <Pressable disabled={busy} style={styles.choice} onPress={() => photograph(side)}><Text style={styles.link}>{images[side] ? 'Reprendre' : 'Photographier'} {side === 'front' ? type === 'passport' ? 'la page d’identité' : 'le recto' : 'le verso'}</Text></Pressable>
          </View>)}
          <Pressable disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(v => !v)} style={styles.choice}>
            <Text style={styles.text}>{consent ? '☑' : '☐'} J’accepte le traitement de ma pièce et de mon selfie vidéo par AWS pour vérifier mon identité et comparer mon visage. Zwanga conserve la pièce, le selfie de référence et les résultats sans expiration automatique, avec accès réservé aux personnes autorisées. Je peux contacter le support pour les droits applicables et demander leur suppression.</Text>
          </Pressable>
          <Pressable style={[styles.button, (!consent || !images.front || (type !== 'passport' && !images.back)) && styles.disabled]} disabled={busy || !consent || !images.front || (type !== 'passport' && !images.back)} onPress={submit}><Text style={styles.buttonText}>Envoyer ma pièce</Text></Pressable>
        </> : <>
          <Text style={styles.heading}>{approved ? 'Identité vérifiée' : reviewing ? 'Vérification complémentaire' : failed ? 'Vérification à reprendre' : captureReady ? 'Passons au selfie vidéo' : 'Vérification en cours'}</Text>
          <Text style={styles.text}>{reviewing ? 'Un contrôle nécessite une vérification par notre équipe. Vous recevrez une notification après la décision. Il n’est pas nécessaire de recommencer.' : approved ? 'Votre identité a été validée. Si vous avez déjà ajouté un véhicule actif, votre profil conducteur est activé. Sinon, vous profitez d’un compte passager vérifié.' : failed ? 'La capture a expiré ou un contrôle n’a pas pu aboutir. Vérifiez les noms de votre profil et utilisez une photo nette de votre pièce originale.' : captureReady ? 'Placez-vous dans un endroit éclairé et suivez les instructions. La capture utilise des variations lumineuses. Vous pouvez interrompre et contacter le support si cela ne vous convient pas.' : 'Vous pouvez revenir plus tard. Si le selfie n’a pas été terminé, la session expirera et une nouvelle tentative sera possible.'}</Text>
          {captureReady && <Pressable disabled={busy} style={styles.button} onPress={capture}><Text style={styles.buttonText}>Commencer le selfie vidéo</Text></Pressable>}
          {failed && <Pressable disabled={busy} style={styles.button} onPress={() => { setSession(undefined); setNewAttempt(true); setConsent(false); requestId.current = randomUUID(); setError(''); }}><Text style={styles.buttonText}>Recommencer</Text></Pressable>}
          {(reviewing || approved) && <Pressable style={styles.button} onPress={() => void finish()}><Text style={styles.buttonText}>Terminer</Text></Pressable>}
        </>}
        {busy && <ActivityIndicator color={Colors.primary} accessibilityLabel="Traitement en cours" />}
        {(error || state.isError && !canForm) ? <Text accessibilityRole="alert" style={styles.error}>{error || 'Connexion indisponible. Votre dossier reste enregistré.'}</Text> : null}
        {!busy && <Pressable onPress={() => { void state.refetch(); }}><Text style={styles.link}>Actualiser le statut</Text></Pressable>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' }, header: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { padding: 24, gap: 16, paddingBottom: 40 }, title: { fontSize: 20, fontWeight: '700' }, subtitle: { color: '#666', fontSize: 14 },
  heading: { fontSize: 24, fontWeight: '700', marginTop: 12 }, text: { fontSize: 16, lineHeight: 24, color: '#253038' },
  choice: { padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 12 }, selected: { borderColor: Colors.primary, backgroundColor: '#fff5f0' },
  button: { backgroundColor: Colors.primary, padding: 18, borderRadius: 14, alignItems: 'center' }, buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { color: Colors.primary, fontSize: 16, fontWeight: '600' }, disabled: { opacity: 0.4 }, error: { color: '#b42318', fontSize: 16 }, preview: { height: 180, width: '100%' },
});
