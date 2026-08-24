import { Platform, Share } from 'react-native';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';

const PUBLIC_TRACKING_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

/**
 * Refuse les deep links mobiles et les chemins relatifs : le suivi partagé doit
 * toujours pouvoir s'ouvrir dans un navigateur sans installer l'application.
 */
export function normalizePublicTrackingUrl(publicUrl: string): string {
  const normalizedUrl = publicUrl.trim();
  if (!PUBLIC_TRACKING_URL_PATTERN.test(normalizedUrl)) {
    throw new Error('Le serveur n\'a pas fourni de lien web de suivi valide.');
  }

  return normalizedUrl;
}

/**
 * Génère un message de partage pour un trajet
 * @param publicUrl Lien web public de suivi
 * @param departureName Nom du lieu de départ
 * @param arrivalName Nom du lieu d'arrivée
 * @returns Message de partage formaté
 */
export function generateTripShareMessage(
  publicUrl: string,
  departureName?: string,
  arrivalName?: string,
): string {
  const link = normalizePublicTrackingUrl(publicUrl);
  const route = departureName && arrivalName 
    ? `${departureName} → ${arrivalName}`
    : 'mon trajet';
  
  return `Suivez ${route} en temps réel sur Zwanga :\n${link}`;
}

/**
 * Partage un trajet via l'API native de partage
 * @param publicUrl Lien web public de suivi
 * @param departureName Nom du lieu de départ
 * @param arrivalName Nom du lieu d'arrivée
 */
export async function shareTrip(
  publicUrl: string,
  departureName?: string,
  arrivalName?: string,
): Promise<void> {
  try {
    const url = normalizePublicTrackingUrl(publicUrl);
    const message = generateTripShareMessage(url, departureName, arrivalName);
    
    const result = await Share.share({
      message: message,
      url: Platform.OS === 'ios' ? url : undefined, // iOS utilise url, Android utilise message
      title: 'Partager le trajet',
    });

    if (result.action === Share.sharedAction) {
      if (result.activityType) {
        // Partagé avec une activité spécifique (ex: WhatsApp, SMS)
        console.log('Partagé via:', result.activityType);
      } else {
        // Partagé avec succès
        console.log('Trajet partagé avec succès');
      }
    } else if (result.action === Share.dismissedAction) {
      // Partage annulé
      console.log('Partage annulé');
    }
  } catch (error: any) {
    console.error('Erreur lors du partage:', error.message);
    throw error;
  }
}

/**
 * Partage un trajet via WhatsApp spécifiquement
 * @param publicUrl Lien web public de suivi
 * @param phoneNumber Numéro de téléphone (optionnel)
 * @param departureName Nom du lieu de départ
 * @param arrivalName Nom du lieu d'arrivée
 */
export async function shareTripViaWhatsApp(
  publicUrl: string,
  phoneNumber?: string,
  departureName?: string,
  arrivalName?: string,
): Promise<void> {
  try {
    const message = generateTripShareMessage(publicUrl, departureName, arrivalName);
    let url: string;
    if (phoneNumber) {
      // Format WhatsApp avec numéro de téléphone
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      url = `whatsapp://send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
    } else {
      // Format WhatsApp sans numéro (ouvre la liste de contacts)
      url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    }

    if (await openExternalUrlSafely(url, { logLabel: 'ShareWhatsApp' })) {
      return;
    } else {
      // Fallback vers le partage standard si WhatsApp n'est pas installé
      await shareTrip(publicUrl, departureName, arrivalName);
    }
  } catch (error: any) {
    console.error('Erreur lors du partage via WhatsApp:', error.message);
    // Fallback vers le partage standard
    await shareTrip(publicUrl, departureName, arrivalName);
  }
}

/**
 * Partage un lien public de suivi via WhatsApp.
 */
export async function shareTrackingLinkViaWhatsApp(input: {
  message: string;
  fallbackTitle?: string;
}): Promise<void> {
  const url = `whatsapp://send?text=${encodeURIComponent(input.message)}`;

  try {
    if (await openExternalUrlSafely(url, { logLabel: 'TrackingWhatsApp' })) {
      return;
    }
  } catch (error: any) {
    console.warn('WhatsApp indisponible:', error?.message ?? error);
  }

  await Share.share({
    title: input.fallbackTitle ?? 'Partager le suivi',
    message: input.message,
  });
}

/**
 * Partage un trajet via SMS
 * @param publicUrl Lien web public de suivi
 * @param phoneNumber Numéro de téléphone
 * @param departureName Nom du lieu de départ
 * @param arrivalName Nom du lieu d'arrivée
 */
export async function shareTripViaSMS(
  publicUrl: string,
  phoneNumber: string,
  departureName?: string,
  arrivalName?: string,
): Promise<void> {
  try {
    const message = generateTripShareMessage(publicUrl, departureName, arrivalName);
    const smsUrl = `sms:${phoneNumber}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;
    
    if (await openExternalUrlSafely(smsUrl, { logLabel: 'ShareSms' })) {
      return;
    } else {
      // Fallback vers le partage standard
      await shareTrip(publicUrl, departureName, arrivalName);
    }
  } catch (error: any) {
    console.error('Erreur lors du partage via SMS:', error.message);
    // Fallback vers le partage standard
    await shareTrip(publicUrl, departureName, arrivalName);
  }
}
/**
 * Ouvre le client email avec un lien public de suivi de trajet.
 */
export async function shareTripViaEmail(input: {
  mailtoUrl?: string;
  subject: string;
  body: string;
  fallbackUrl?: string;
}): Promise<void> {
  const mailtoUrl = input.mailtoUrl || `mailto:?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(input.body)}`;

  try {
    if (await openExternalUrlSafely(mailtoUrl, { logLabel: 'ShareEmail' })) {
      return;
    }
  } catch (error: any) {
    console.warn('Client email indisponible:', error?.message ?? error);
  }

  await Share.share({
    title: input.subject,
    message: input.fallbackUrl ? `${input.body}\n\n${input.fallbackUrl}` : input.body,
  });
}
