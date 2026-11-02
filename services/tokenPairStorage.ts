import * as SecureStore from 'expo-secure-store';

export type TokenPair = { accessToken: string | null; refreshToken: string | null };
export const TOKEN_PAIR_KEY = 'zwanga.session-pair.v2';

/** One native write commits both credentials. Legacy keys are read only for migration. */
export async function readTokenPair(accessKey: string, refreshKey: string): Promise<TokenPair> {
  const encoded = await SecureStore.getItemAsync(TOKEN_PAIR_KEY);
  if (encoded !== null) {
    let value;
    try { value = JSON.parse(encoded); } catch { /* Never fall back to an older identity. */ }
    if (value?.version !== 2 ||
        ![value.accessToken, value.refreshToken].every(token => token === null || typeof token === 'string')) {
      throw new Error('La session enregistrée est illisible. Réessayez.');
    }
    return { accessToken: value.accessToken, refreshToken: value.refreshToken };
  }
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(accessKey), SecureStore.getItemAsync(refreshKey),
  ]);
  return { accessToken, refreshToken };
}

export async function writeTokenPair(pair: TokenPair, accessKey: string, refreshKey: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_PAIR_KEY, JSON.stringify({ version: 2, ...pair }));
  // A committed envelope remains authoritative even if legacy cleanup is interrupted.
  await Promise.allSettled([accessKey, refreshKey].map(key => SecureStore.deleteItemAsync(key)));
}
