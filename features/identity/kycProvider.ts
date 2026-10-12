// Didit remains the released mobile journey. AWS requires an explicit mobile
// opt-in as well as backend activation; the server flag alone cannot switch it.
// Expo inlines this public, non-secret flag when building the JavaScript bundle.
export const AWS_KYC_MOBILE_ENABLED = process.env.EXPO_PUBLIC_AWS_KYC_ENABLED === 'true';

export async function shouldStartAwsKyc(readCapabilities: () => Promise<{ enabled: boolean }>): Promise<boolean> {
  if (!AWS_KYC_MOBILE_ENABLED) return false;
  try {
    return (await readCapabilities()).enabled === true;
  } catch (error: unknown) {
    // An old backend stays on Didit. Real errors must not silently charge a
    // different provider after the future AWS rollout has been opted into.
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) return false;
    throw error;
  }
}
