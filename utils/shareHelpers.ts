import { Linking, Platform, Share } from 'react-native';
import Constants from 'expo-constants';

/**
 * Génère un lien de partage pour un trajet
 * @param tripId ID du trajet
 * @returns URL de partage (deep link ou URL web)
 */
export function generateTripShareLink(tripId: string): string {
  // Deep link pour l'app mobile
  const deepLink = `zwanga://trip/${tripId}?track=true`;
  
  // URL web de fallback (si vous avez une page web pour le suivi)
  const webUrl = `https://zwanga.cd/trip/${tripId}?track=true`;
  
  // Pour l'instant, on utilise le deep link
  // Si l'app n'est pas installée, le système proposera d'ouvrir dans le navigateur
  return deepLink;
}

/**
 * Génère un message de partage pour un trajet
 * @param tripId ID du trajet
 * @param departureName Nom du lieu de départ
 * @param arrivalName Nom du lieu d'arrivée
 * @returns Message de partage formaté
 */
export function generateTripShareMessage(
  tripId: string,
  departureName?: string,
  arrivalName?: string,
): string {
  const link = generateTripShareLink(tripId);
  const route = departureName && arrivalName 
    ? `${departureName} → ${arrivalName}`
    : 'mon trajet';
  
  return `Suivez ${route} en temps réel sur Zwanga :\n${link}`;
}

/**
 * Partage un trajet via l'API native de partage
 * @param tripId ID du trajet
 * @param departureName Nom du lieu de départ
 * @param arrivalName Nom du lieu d'arrivée
 */
export async function shareTrip(
  tripId: string,
  departureName?: string,
  arrivalName?: string,
): Promise<void> {
  try {
    const message = generateTripShareMessage(tripId, departureName, arrivalName);
    const url = generateTripShareLink(tripId);
    
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
 * @param tripId ID du trajet
 * @param phoneNumber Numéro de téléphone (optionnel)
 * @param departureName Nom du lieu de départ
 * @param arrivalName Nom du lieu d'arrivée
 */
export async function shareTripViaWhatsApp(
  tripId: string,
  phoneNumber?: string,
  departureName?: string,
  arrivalName?: string,
): Promise<void> {
  try {
    const message = generateTripShareMessage(tripId, departureName, arrivalName);
    const link = generateTripShareLink(tripId);
    
    let url: string;
    if (phoneNumber) {
      // Format WhatsApp avec numéro de téléphone
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      url = `whatsapp://send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
    } else {
      // Format WhatsApp sans numéro (ouvre la liste de contacts)
      url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    }

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Fallback vers le partage standard si WhatsApp n'est pas installé
      await shareTrip(tripId, departureName, arrivalName);
    }
  } catch (error: any) {
    console.error('Erreur lors du partage via WhatsApp:', error.message);
    // Fallback vers le partage standard
    await shareTrip(tripId, departureName, arrivalName);
  }
}

/**
 * Partage un trajet via SMS
 * @param tripId ID du trajet
 * @param phoneNumber Numéro de téléphone
 * @param departureName Nom du lieu de départ
 * @param arrivalName Nom du lieu d'arrivée
 */
export async function shareTripViaSMS(
  tripId: string,
  phoneNumber: string,
  departureName?: string,
  arrivalName?: string,
): Promise<void> {
  try {
    const message = generateTripShareMessage(tripId, departureName, arrivalName);
    const smsUrl = `sms:${phoneNumber}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;
    
    const canOpen = await Linking.canOpenURL(smsUrl);
    if (canOpen) {
      await Linking.openURL(smsUrl);
    } else {
      // Fallback vers le partage standard
      await shareTrip(tripId, departureName, arrivalName);
    }
  } catch (error: any) {
    console.error('Erreur lors du partage via SMS:', error.message);
    // Fallback vers le partage standard
    await shareTrip(tripId, departureName, arrivalName);
  }
}

