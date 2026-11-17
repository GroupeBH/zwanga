import { normalizeDriverQrLink } from '@/features/driver-qr/driverQrModel';
import { referralQrPng, type ReferralQrSvg } from './shareReferralQr';

/** Dedicated cache and caption: this is not a referral invitation. */
export async function shareDriverQr(svg: ReferralQrSvg, value: string, isCurrent: () => boolean) {
  const link = normalizeDriverQrLink(value);
  if (!link) throw new Error('Invalid driver URL');
  const [FileSystem, Sharing, Crypto] = await Promise.all([
    import('expo-file-system/legacy'), import('expo-sharing'), import('expo-crypto'),
  ]);
  if (!isCurrent()) return false;
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable');
  const key = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, link);
  const uri = `${FileSystem.cacheDirectory}zwanga-driver-qr-v1-${key}.png`;
  const cached = await FileSystem.getInfoAsync(uri);
  if (!isCurrent()) return false;
  let created = false;
  let shared = false;
  try {
    if (!cached.exists) {
      const png = await referralQrPng(svg);
      if (!isCurrent()) return false;
      created = true;
      await FileSystem.writeAsStringAsync(uri, png, { encoding: FileSystem.EncodingType.Base64 });
    }
    if (!isCurrent()) return false;
    shared = true;
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Partager ma fiche conducteur Zwanga' });
    return true;
  } finally {
    if (created && !shared) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}
