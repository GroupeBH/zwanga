import { Linking } from 'react-native';

type SafeExternalUrlOptions = {
  logLabel?: string;
};

export async function openExternalUrlSafely(
  url?: string | null,
  options: SafeExternalUrlOptions = {},
): Promise<boolean> {
  if (!url) {
    return false;
  }

  const logLabel = options.logLabel ?? 'ExternalUrl';

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      console.warn(`[${logLabel}] URL not supported:`, url);
      return false;
    }

    await Linking.openURL(url);
    return true;
  } catch (error) {
    console.warn(`[${logLabel}] Failed to open URL:`, error);
    return false;
  }
}
