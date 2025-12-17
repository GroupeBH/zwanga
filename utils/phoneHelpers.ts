import { Linking } from 'react-native';

/**
 * Formate un numéro de téléphone pour l'appel téléphonique
 * Supprime les caractères non numériques sauf le +
 */
export function formatPhoneForCall(phone: string): string {
  // Garder le + au début si présent, puis ne garder que les chiffres
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Si le numéro commence par +, le garder, sinon ajouter +
  if (cleaned.startsWith('+')) {
    return cleaned;
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
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Si le numéro commence par +, le garder
  if (cleaned.startsWith('+')) {
    // Si c'est déjà +243, le retourner tel quel
    if (cleaned.startsWith('+243')) {
      return cleaned;
    }
    // Sinon, remplacer le + par +243
    return '+243' + cleaned.substring(1);
  }
  
  // Si le numéro commence par 0, remplacer le 0 par +243
  if (cleaned.startsWith('0')) {
    return '+243' + cleaned.substring(1);
  }
  
  // Si le numéro commence déjà par 243, ajouter le +
  if (cleaned.startsWith('243')) {
    return '+' + cleaned;
  }
  
  // Par défaut, ajouter +243
  return '+243' + cleaned;
}

/**
 * Ouvre l'application d'appel téléphonique avec le numéro donné
 */
export async function openPhoneCall(
  phone: string,
  onError?: (message: string) => void
): Promise<void> {
  const phoneNumber = formatPhoneForCall(phone);
  const url = `tel:${phoneNumber}`;
  
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      const errorMsg = 'Impossible d\'ouvrir l\'application d\'appel.';
      if (onError) {
        onError(errorMsg);
      } else {
        console.error(errorMsg);
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'ouverture de l\'appel:', error);
    const errorMsg = 'Impossible d\'ouvrir l\'application d\'appel.';
    if (onError) {
      onError(errorMsg);
    }
  }
}

/**
 * Ouvre WhatsApp avec le numéro donné
 */
export async function openWhatsApp(
  phone: string,
  onError?: (message: string) => void
): Promise<void> {
  const phoneNumber = formatPhoneForWhatsApp(phone);
  // Pour l'URL WhatsApp, retirer le + car WhatsApp nécessite le format sans +
  const phoneNumberForUrl = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
  const url = `whatsapp://send?phone=${phoneNumberForUrl}`;
  
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Essayer avec https://wa.me/ si l'app n'est pas installée
      // Pour wa.me, on peut garder le + ou le retirer, les deux fonctionnent
      const webUrl = `https://wa.me/${phoneNumberForUrl}`;
      const canOpenWeb = await Linking.canOpenURL(webUrl);
      if (canOpenWeb) {
        await Linking.openURL(webUrl);
      } else {
        const errorMsg = 'WhatsApp n\'est pas installé sur votre appareil.';
        if (onError) {
          onError(errorMsg);
        } else {
          console.error(errorMsg);
        }
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'ouverture de WhatsApp:', error);
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

