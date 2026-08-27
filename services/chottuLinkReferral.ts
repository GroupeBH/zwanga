import { chottuLinkReferralConfig } from '@/config/env';
import * as Linking from 'expo-linking';
import {
  DeviceEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';

type ChottuLinkModule = typeof import('react-native-chottulink-sdk');

interface ChottuLinkResolvedEvent {
  url?: unknown;
  metadata?: {
    originalURL?: unknown;
    shortLinkRaw?: unknown;
    resolvedAt?: unknown;
    isDeferred?: unknown;
  };
}

export interface ChottuLinkReferralPayload {
  token: string;
  capturedAt: string;
  referringLink?: string;
  isDeferred: boolean;
}

const loadChottuLink = (): ChottuLinkModule | null => {
  if (!chottuLinkReferralConfig.enabled) return null;
  try {
    // Chargement conditionnel requis pour garder Expo Go utilisable sans module natif.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-chottulink-sdk') as ChottuLinkModule;
  } catch (error) {
    console.warn('[ChottuLink] Module natif indisponible:', error);
    return null;
  }
};

const isChottuLinkUrl = (value: string) => {
  try {
    return new URL(value).hostname === chottuLinkReferralConfig.domain;
  } catch {
    return false;
  }
};

const normalizeCapturedAt = (value: unknown) => {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
};

export const extractChottuLinkReferral = (
  event: ChottuLinkResolvedEvent,
): ChottuLinkReferralPayload | null => {
  if (typeof event.url !== 'string') return null;
  try {
    const destination = new URL(event.url);
    if (destination.searchParams.get('provider') !== 'chottulink') {
      return null;
    }
    const token = destination.searchParams.get('referralToken')?.trim();
    if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;

    const referringLink =
      typeof event.metadata?.shortLinkRaw === 'string'
        ? event.metadata.shortLinkRaw
        : typeof event.metadata?.originalURL === 'string'
          ? event.metadata.originalURL
          : undefined;
    return {
      token,
      capturedAt: normalizeCapturedAt(event.metadata?.resolvedAt),
      isDeferred: event.metadata?.isDeferred === true,
      ...(referringLink ? { referringLink } : {}),
    };
  } catch {
    return null;
  }
};

export const handleIncomingChottuLink = (url: string) => {
  if (!isChottuLinkUrl(url)) return false;
  const chottuLink = loadChottuLink();
  if (!chottuLink) return false;
  chottuLink.handleLink(url);
  return true;
};

export const subscribeToChottuLinkReferrals = (
  onReferral: (payload: ChottuLinkReferralPayload) => void,
) => {
  const chottuLink = loadChottuLink();
  if (!chottuLink) return () => undefined;

  const emitter =
    Platform.OS === 'ios' && NativeModules.ChottuLinkEventEmitter
      ? new NativeEventEmitter(NativeModules.ChottuLinkEventEmitter)
      : DeviceEventEmitter;
  const resolvedSubscription = emitter.addListener(
    'ChottuLinkDeepLinkResolved',
    (event: ChottuLinkResolvedEvent) => {
      const referral = extractChottuLinkReferral(event);
      if (referral) onReferral(referral);
    },
  );
  const errorSubscription = emitter.addListener(
    'ChottuLinkDeepLinkError',
    (error) => console.warn('[ChottuLink] Erreur de lien:', error),
  );

  let cachedAttributionRetry: ReturnType<typeof setTimeout> | null = null;
  const deliverCachedAttribution = async () => {
    try {
      const attribution = await chottuLink.getAttributionData();
      if (!attribution?.isAttributed || !attribution.matchFound) return;
      const destination =
        attribution.destinationWithUtm ?? attribution.destinationUrl;
      if (!destination) return;
      const referral = extractChottuLinkReferral({
        url: destination,
        metadata: {
          shortLinkRaw:
            attribution.clickedShortUrl ?? attribution.shortUrl ?? undefined,
          resolvedAt: new Date().toISOString(),
          isDeferred: true,
        },
      });
      if (referral) onReferral(referral);
    } catch (error) {
      console.warn(
        "[ChottuLink] Attribution d'installation indisponible:",
        error,
      );
    }
  };

  try {
    chottuLink.initializeChottuLink(
      chottuLinkReferralConfig.mobileApiKey,
    );
  } catch (error) {
    console.warn('[ChottuLink] Initialisation impossible:', error);
  }

  // The native SDK may already have cached an install attribution before the
  // JavaScript event listener is ready. Read it immediately, then once more
  // after initialization has had time to finish.
  void deliverCachedAttribution();
  cachedAttributionRetry = setTimeout(() => {
    void deliverCachedAttribution();
  }, 1500);

  void Linking.getInitialURL().then((url) => {
    if (url) handleIncomingChottuLink(url);
  });
  const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
    handleIncomingChottuLink(url);
  });

  return () => {
    if (cachedAttributionRetry) clearTimeout(cachedAttributionRetry);
    resolvedSubscription.remove();
    errorSubscription.remove();
    linkingSubscription.remove();
  };
};
