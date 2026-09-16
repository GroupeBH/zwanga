import { Linking } from 'react-native';

/**
 * Formate un numéro de téléphone pour l'appel téléphonique
 * Supprime les caractères non numériques sauf le +
 */
export function formatPhoneForCall(phone: string): string {
  // Garder le + au début si présent, puis ne garder que les chiffres
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return '+' + digits.substring(2);
  // Si le numéro commence par +, le garder, sinon ajouter +
  if (cleaned.startsWith('+')) {
    return '+' + digits;
  }
  // Si le numéro commence par 0, le remplacer par +243 (RDC)
  if (cleaned.startsWith('0')) {
    return '+243' + cleaned.substring(1);
  }
  // Si le numéro commence par 243, ajouter +
  if (cleaned.startsWith('243')) {
    return '+' + cleaned;
  }
  // Par défaut, ajouter +243
  return '+243' + cleaned;
}

/**
 * Formate un numéro de téléphone pour WhatsApp
 * WhatsApp nécessite le format international avec +243
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  
  // Si le numéro commence par +, le garder
  if (cleaned.startsWith('+') && !cleaned.startsWith('+243')) {
    return `+${digits}`;
  }

  if (cleaned.startsWith('+')) {
    // Si c'est déjà +243, le retourner tel quel
    if (cleaned.startsWith('+243')) {
      return cleaned;
    }
    // Sinon, remplacer le + par +243
    return '+243' + cleaned.substring(1);
  }
  
  // Si le numéro commence par 0, remplacer le 0 par +243
  if (digits.startsWith('00')) {
    return `+${digits.substring(2)}`;
  }

  if (cleaned.startsWith('0')) {
    return '+243' + digits.substring(1);
  }
  
  // Si le numéro commence déjà par 243, ajouter le +
  if (digits.startsWith('243')) {
    return '+' + digits;
  }
  
  // Par défaut, ajouter +243
  return '+243' + digits;
}

/**
 * Ouvre l'application d'appel téléphonique avec le numéro donné
 */
export async function openPhoneCall(
  phone: string,
  onError?: (message: string) => void
): Promise<void> {
  if (!phone || phone.trim() === '') {
    const errorMsg = 'Numéro de téléphone invalide.';
    if (onError) {
      onError(errorMsg);
    }
    return;
  }

  // Formater le numéro pour l'appel
  const phoneNumber = formatPhoneForCall(phone);
  
  // Pour tel:, on peut garder le + ou le retirer selon la plateforme
  // Sur iOS et Android, tel: fonctionne avec ou sans +
  // Mais pour être sûr, on retire les caractères spéciaux sauf les chiffres et le +
  const cleanedNumber = phoneNumber.replace(/[^\d+]/g, '');
  
  if (!cleanedNumber || !/\d/.test(cleanedNumber)) {
    onError?.('Numéro de téléphone invalide.');
    return;
  }
  // L'ouverture est déclenchée uniquement par le bouton Appeler. Ne pas la
  // bloquer sur canOpenURL : les requêtes de visibilité natives peuvent manquer.
  const url = `tel:${cleanedNumber}`;
  
  try {
    await Linking.openURL(url);
  } catch {
    onError?.('L’appel n’a pas été ouvert. Réessayez ou utilisez WhatsApp.');
  }
}

/**
 * Ouvre WhatsApp avec le numéro donné
 */
export async function openWhatsApp(
  phone: string,
  onError?: (message: string) => void
): Promise<void> {
  if (!phone || phone.trim() === '') {
    const errorMsg = 'Numéro de téléphone invalide.';
    if (onError) {
      onError(errorMsg);
    }
    return;
  }

  const phoneNumber = formatPhoneForWhatsApp(phone);
  // Pour l'URL WhatsApp, retirer le + car WhatsApp nécessite le format sans +
  const phoneNumberForUrl = phoneNumber.replace(/\D/g, '');
  if (!phoneNumberForUrl) {
    const errorMsg = 'Numéro de téléphone invalide.';
    if (onError) {
      onError(errorMsg);
    }
    return;
  }
  const url = `whatsapp://send?phone=${phoneNumberForUrl}`;
  const webUrl = `https://wa.me/${phoneNumberForUrl}`;
  
  try {
    await Linking.openURL(url);
  } catch {
    try {
      await Linking.openURL(webUrl);
      return;
    } catch { /* Afficher un message compréhensible, sans erreur native. */ }
    const errorMsg = 'Impossible d\'ouvrir WhatsApp.';
    if (onError) {
      onError(errorMsg);
    }
  }
}

/**
 * Types pour les callbacks de contact
 */
export type ContactErrorCallback = (message: string) => void;

