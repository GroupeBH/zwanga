import { KycUserFacingError } from './diditErrors';

export type KycProvider = 'didit' | 'aws';

// Expo requires static dot notation to inline these public, non-secret values.
// Didit uses its native SDK by default. AWS remains an explicit opt-in.
const configuredProvider = process.env.EXPO_PUBLIC_KYC_PROVIDER?.trim().toLowerCase();
const selectedProvider = configuredProvider || 'didit';

// Invalid configuration must block KYC, not crash the whole app on import or
// silently create a paid verification with an unintended provider.
export const KYC_PROVIDER: KycProvider | null =
  selectedProvider === 'didit' || selectedProvider === 'aws' ? selectedProvider : null;
export const AWS_KYC_MOBILE_ENABLED = KYC_PROVIDER === 'aws';

const awsUnavailable = (reason?: string | null) => new KycUserFacingError({
  category: 'service_unavailable',
  code: reason === 'AWS_KYC_DISABLED' || reason === 'AWS_KYC_CONFIGURATION_REQUIRED' ? reason : 'AWS_KYC_UNAVAILABLE',
  title: reason === 'AWS_KYC_DISABLED' || reason === 'AWS_KYC_CONFIGURATION_REQUIRED' ? 'Vérification en préparation' : 'Vérification indisponible',
  message: reason === 'AWS_KYC_DISABLED' || reason === 'AWS_KYC_CONFIGURATION_REQUIRED'
    ? 'La vérification d’identité n’est pas encore activée. Contactez le support pour être accompagné.'
    : 'Le service de vérification choisi n’est pas disponible pour le moment. Réessayez plus tard ou contactez le support.',
}, 'AWS KYC was selected, but the backend does not enable this flow.');

export async function shouldStartAwsKyc(readCapabilities: () => Promise<{ enabled: boolean; unavailableCode?: string | null }>): Promise<boolean> {
  if (!KYC_PROVIDER) {
    throw new KycUserFacingError({
      category: 'service_unavailable',
      code: 'KYC_PROVIDER_INVALID',
      title: 'Vérification indisponible',
      message: 'La vérification d’identité n’est pas correctement configurée dans cette version. Contactez le support.',
    }, 'EXPO_PUBLIC_KYC_PROVIDER must be didit or aws.');
  }
  if (KYC_PROVIDER === 'didit') return false;
  try {
    const capabilities = await readCapabilities();
    if (capabilities?.enabled !== true) throw awsUnavailable(capabilities?.unavailableCode);
    return true;
  } catch (error: unknown) {
    // Respect the selected provider even on an old backend. Never open Didit
    // after an AWS error, missing endpoint or disabled server configuration.
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) throw awsUnavailable();
    throw error;
  }
}
