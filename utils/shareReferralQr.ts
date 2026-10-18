import { referralQrLink } from '@/features/referrals/referralQrModel';

export type ReferralQrSvg = {
  toDataURL: (callback: (base64: string) => void, options?: { width: number; height: number }) => void;
};

export function referralQrPng(svg: ReferralQrSvg): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('QR export timed out')), 8000);
    try {
      svg.toDataURL(value => {
        clearTimeout(timer);
        if (typeof value !== 'string') { reject(new Error('Invalid QR image')); return; }
        const data = value.replace(/^data:image\/png;base64,/, '');
        if (!data.startsWith('iVBORw0KGgo') || data.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/]+=*$/.test(data)) {
          reject(new Error('Invalid QR image')); return;
        }
        resolve(data);
      }, { width: 1024, height: 1024 });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}

/** Native modules are loaded only on demand. No image service or media-library permission. */
export async function shareReferralQr(svg: ReferralQrSvg, value: string, isCurrent: () => boolean) {
  const link = referralQrLink(value);
  if (!link) throw new Error('Invalid invitation URL');
  const [FileSystem, Sharing, Crypto] = await Promise.all([
    import('expo-file-system/legacy'), import('expo-sharing'), import('expo-crypto'),
  ]);
  if (!isCurrent()) return false;
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable');
  // Immutable per URL: a receiving app may read the attachment after the share sheet closes.
  // Reuse one cache image per invitation instead of creating a file on every tap.
  const key = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, link);
  const uri = `${FileSystem.cacheDirectory}zwanga-referral-qr-v1-${key}.png`;
  const cached = await FileSystem.getInfoAsync(uri);
  if (!isCurrent()) return false;
  let created = false;
  let handedToShareSheet = false;
  try {
    if (!cached.exists) {
      const png = await referralQrPng(svg);
      if (!isCurrent()) return false;
      created = true;
      await FileSystem.writeAsStringAsync(uri, png, { encoding: FileSystem.EncodingType.Base64 });
    }
    if (!isCurrent()) return false;
    handedToShareSheet = true;
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Partager mon QR code Zwanga' });
    return true;
  } finally {
    if (created && !handedToShareSheet) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}
