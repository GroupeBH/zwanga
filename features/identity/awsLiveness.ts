import { NativeModules, Platform } from 'react-native';
import type { AwsLivenessStart } from './awsKycContracts';

export const hasAwsLiveness = () => Platform.OS !== 'web' && typeof NativeModules.ZwangaAwsLiveness?.start === 'function';
export const cancelAwsLiveness = () => NativeModules.ZwangaAwsLiveness?.cancel?.();
export async function captureAwsLiveness(input: AwsLivenessStart): Promise<'completed' | 'cancelled'> {
  if (!hasAwsLiveness()) throw new Error('Cette version ne contient pas la capture AWS. Installez la nouvelle version de Zwanga.');
  if (Date.parse(input.expiresAt) <= Date.now() + 5000) throw new Error('Session expirée. Recommencez la vérification.');
  // Memory only: never AsyncStorage, analytics, logs, URLs or navigation params.
  return NativeModules.ZwangaAwsLiveness.start(input);
}
