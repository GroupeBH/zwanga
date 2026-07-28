import { Linking } from 'react-native';

/**
 * Formate un numéro de téléphone pour l'appel téléphonique
 * Supprime les caractères non numériques sauf le +
 */
export function formatPhoneForCall(phone: string): string {
  // Garder le + au début si présent, puis ne garder que les chiffres
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
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
  
  // Construire l'URL tel: avec le numéro nettoyé
  const url = `tel:${cleanedNumber}`;
  
  try {
    // Vérifier si l'URL peut être ouverte
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Essayer avec le format sans +
      const urlWithoutPlus = `tel:${cleanedNumber.replace(/^\+/, '')}`;
      const canOpenWithoutPlus = await Linking.canOpenURL(urlWithoutPlus);
      
      if (canOpenWithoutPlus) {
        await Linking.openURL(urlWithoutPlus);
      } else {
        const errorMsg = 'Impossible d\'ouvrir l\'application d\'appel. Vérifiez que votre appareil peut passer des appels.';
        if (onError) {
          onError(errorMsg);
        } else {
          console.error(errorMsg);
        }
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
  if (!phone || phone.trim() === '') {
    const errorMsg = 'Numero de telephone invalide.';
    if (onError) {
      onError(errorMsg);
    }
    return;
  }

  const phoneNumber = formatPhoneForWhatsApp(phone);
  // Pour l'URL WhatsApp, retirer le + car WhatsApp nécessite le format sans +
  const phoneNumberForUrl = phoneNumber.replace(/\D/g, '');
  if (!phoneNumberForUrl) {
    const errorMsg = 'Numero de telephone invalide.';
    if (onError) {
      onError(errorMsg);
    }
    return;
  }
  const url = `whatsapp://send?phone=${phoneNumberForUrl}`;
  const webUrl = `https://wa.me/${phoneNumberForUrl}`;
  
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Essayer avec https://wa.me/ si l'app n'est pas installée
      // Pour wa.me, on peut garder le + ou le retirer, les deux fonctionnent
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
    console.warn('Ouverture WhatsApp native indisponible, fallback web:', error);
    try {
      await Linking.openURL(webUrl);
      return;
    } catch (fallbackError) {
      console.error('Erreur lors de l\'ouverture de WhatsApp:', fallbackError);
    }
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

