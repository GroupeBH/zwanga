import { Platform, Share } from 'react-native';

export const buildReferralShareMessage = (shareLink: string) =>
  `Rejoins-moi sur Zwanga avec mon lien d'invitation personnel. ` +
  `Telecharge l'application et inscris-toi ici : ${shareLink}`;

export const normalizeReferralShareLink = (value?: string | null) => {
  const link = value?.trim();
  if (!link) return null;
  try {
    const parsed = new URL(link);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const shareReferralLink = async (value?: string | null) => {
  const shareLink = normalizeReferralShareLink(value);
  if (!shareLink) {
    throw new Error("Le lien d'invitation n'est pas encore disponible.");
  }

  const message = buildReferralShareMessage(shareLink);
  return Share.share(
    {
      title: 'Inviter sur Zwanga',
      message,
      ...(Platform.OS === 'ios' ? { url: shareLink } : {}),
    },
    Platform.OS === 'android'
      ? { dialogTitle: 'Partager mon lien Zwanga' }
      : undefined,
  );
};

export const copyReferralLink = async (value?: string | null) => {
  const shareLink = normalizeReferralShareLink(value);
  if (!shareLink) {
    throw new Error("Le lien d'invitation n'est pas encore disponible.");
  }

  // Loading the module only when the user copies keeps Expo Router route
  // discovery working with a development client that predates this module.
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(shareLink);
  } catch (error) {
    console.warn('[referrals] Presse-papiers natif indisponible:', error);
    throw new Error(
      "La copie n'est pas disponible dans cette version de l'application. Reinstallez l'application puis reessayez.",
    );
  }
  return shareLink;
};
