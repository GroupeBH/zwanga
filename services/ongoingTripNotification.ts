/**
 * Service de notification permanente pour les trajets en cours
 * Similaire à WhatsApp pour les appels en cours
 * 
 * Cette notification reste affichée tant que le trajet est en cours,
 * permettant à l'utilisateur de revenir rapidement à l'application
 */

import { AppState, AppStateStatus, Platform } from 'react-native';

// ID de la notification permanente pour les trajets en cours
export const ONGOING_TRIP_NOTIFICATION_ID = 'ongoing-trip-notification';
export const ONGOING_TRIP_CHANNEL_ID = 'ongoing-trip-channel';

// Types
interface OngoingTripInfo {
  tripId: string;
  departure: string;
  arrival: string;
  role: 'driver' | 'passenger';
  departureTime?: string;
}

// Module Notifee (chargé dynamiquement)
type NotifeeModule = typeof import('@notifee/react-native');
type NotifeeDefault = NotifeeModule['default'];
type AndroidImportance = NotifeeModule['AndroidImportance'];
type AndroidCategory = NotifeeModule['AndroidCategory'];
type AndroidVisibility = NotifeeModule['AndroidVisibility'];
type AndroidStyle = NotifeeModule['AndroidStyle'];

let notifee: NotifeeDefault | null = null;
let AndroidImportanceEnum: typeof AndroidImportance | null = null;
let AndroidCategoryEnum: typeof AndroidCategory | null = null;
let AndroidVisibilityEnum: typeof AndroidVisibility | null = null;
let AndroidStyleEnum: typeof AndroidStyle | null = null;
let canUseForegroundService = false;
let hasTriedLoadingNotifee = false;

function ensureNotifeeLoaded() {
  if (hasTriedLoadingNotifee) {
    return;
  }

  hasTriedLoadingNotifee = true;

  try {
    const notifeeModule = require('@notifee/react-native') as NotifeeModule;
    notifee = notifeeModule.default ?? (notifeeModule as unknown as NotifeeDefault);
    AndroidImportanceEnum = notifeeModule.AndroidImportance;
    AndroidCategoryEnum = notifeeModule.AndroidCategory;
    AndroidVisibilityEnum = notifeeModule.AndroidVisibility;
    AndroidStyleEnum = notifeeModule.AndroidStyle;
    canUseForegroundService =
      typeof (notifeeModule as any).registerForegroundService === 'function' ||
      typeof (notifee as any)?.registerForegroundService === 'function';
  } catch (error) {
    console.warn('[OngoingTripNotification] Notifee non disponible');
  }
}

// État du service
let currentTripInfo: OngoingTripInfo | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let isNotificationShown = false;

/**
 * Crée le canal de notification pour les trajets en cours
 * Ce canal utilise une importance maximale pour les notifications heads-up
 */
async function createOngoingTripChannel(): Promise<string | null> {
  ensureNotifeeLoaded();
  if (!notifee || !AndroidImportanceEnum) return null;

  try {
    const channelId = await notifee.createChannel({
      id: ONGOING_TRIP_CHANNEL_ID,
      name: 'Trajets en cours',
      description: 'Notifications prioritaires pour les trajets actifs',
      importance: AndroidImportanceEnum.HIGH, // HIGH pour heads-up notification
      vibration: true, // Vibration pour attirer l'attention
      lights: true,
      lightColor: '#8B5CF6',
    });
    return channelId;
  } catch (error) {
    console.error('[OngoingTripNotification] Erreur création canal:', error);
    return null;
  }
}

/**
 * Affiche la notification permanente de trajet en cours
 */
async function showOngoingTripNotification(tripInfo: OngoingTripInfo): Promise<void> {
  ensureNotifeeLoaded();
  if (!notifee || !AndroidCategoryEnum || !AndroidVisibilityEnum || !AndroidImportanceEnum) {
    console.warn('[OngoingTripNotification] Notifee non disponible');
    return;
  }

  try {
    const channelId = await createOngoingTripChannel();
    if (!channelId && Platform.OS === 'android') {
      console.error('[OngoingTripNotification] Canal non créé');
      return;
    }

    const isDriver = tripInfo.role === 'driver';
    const title = isDriver ? 'Trajet en cours' : 'Vous êtes en route';
    const body = `${tripInfo.departure} → ${tripInfo.arrival}`;
    const subtitle = isDriver 
      ? 'Vous conduisez ce trajet' 
      : 'Vous êtes passager sur ce trajet';
    const androidStyle = AndroidStyleEnum
      ? {
          type: AndroidStyleEnum.BIGTEXT,
          text: `${body}\n${subtitle}`,
        }
      : undefined;

    await notifee.displayNotification({
      id: ONGOING_TRIP_NOTIFICATION_ID,
      title,
      body,
      subtitle: Platform.OS === 'ios' ? subtitle : undefined,
      android: {
        channelId: channelId || ONGOING_TRIP_CHANNEL_ID,
        importance: AndroidImportanceEnum.HIGH,
        category: AndroidCategoryEnum.NAVIGATION,
        visibility: AndroidVisibilityEnum.PUBLIC,
        smallIcon: 'ic_notification',
        largeIcon: 'ic_launcher',
        colorized: true,
        ongoing: true, // Notification permanente non-dismissable
        autoCancel: false,
        onlyAlertOnce: true,
        // Foreground service pour garder la notification visible et prioritaire
        asForegroundService: canUseForegroundService,
        pressAction: {
          id: 'ongoing-trip-press',
          launchActivity: 'default',
        },
        // Full screen action pour afficher en heads-up (comme un appel)
        fullScreenAction: {
          id: 'ongoing-trip-fullscreen',
          launchActivity: 'default',
        },
        // Couleur de la notification
        color: isDriver ? '#8B5CF6' : '#06B6D4', // Violet pour conducteur, Cyan pour passager
        // Actions rapides
        actions: [
          {
            title: isDriver ? 'Gérer le trajet' : 'Voir le trajet',
            pressAction: {
              id: 'view-trip',
            },
          },
        ],
        // Timestamp (pour afficher la durée)
        showTimestamp: true,
        timestamp: Date.now(),
        chronometerDirection: 'up',
        showChronometer: true,
        style: androidStyle,
      },
      ios: {
        categoryId: 'ongoing-trip',
        // Sur iOS, on ne peut pas avoir de notification "ongoing" comme sur Android
        // Mais on peut utiliser une notification persistante avec une priorité élevée
        interruptionLevel: 'timeSensitive',
        relevanceScore: 1.0,
      },
      data: {
        type: 'ongoing_trip',
        tripId: tripInfo.tripId,
        role: tripInfo.role,
        navigateTo: isDriver 
          ? `/trip/manage/${tripInfo.tripId}` 
          : `/trip/${tripInfo.tripId}`,
      },
    });

    isNotificationShown = true;
    console.log('[OngoingTripNotification] Notification affichée pour trajet:', tripInfo.tripId);
  } catch (error) {
    console.error('[OngoingTripNotification] Erreur affichage notification:', error);
  }
}

/**
 * Masque la notification de trajet en cours
 */
async function hideOngoingTripNotification(): Promise<void> {
  ensureNotifeeLoaded();
  if (!notifee) return;

  try {
    // Arrêter le foreground service
    await notifee.stopForegroundService();
    // Annuler la notification
    await notifee.cancelNotification(ONGOING_TRIP_NOTIFICATION_ID);
    isNotificationShown = false;
    console.log('[OngoingTripNotification] Notification masquée');
  } catch (error) {
    console.error('[OngoingTripNotification] Erreur masquage notification:', error);
  }
}

/**
 * Gère les changements d'état de l'application
 */
function handleAppStateChange(nextAppState: AppStateStatus): void {
  if (!currentTripInfo) return;

  if (nextAppState === 'background' || nextAppState === 'inactive') {
    // L'app passe en arrière-plan : afficher la notification
    if (!isNotificationShown) {
      showOngoingTripNotification(currentTripInfo);
    }
  } else if (nextAppState === 'active') {
    // L'app revient au premier plan : masquer la notification
    // (optionnel : on peut la laisser visible si on préfère)
    hideOngoingTripNotification();
  }
}

/**
 * Démarre le suivi d'un trajet en cours
 * Appelé quand un trajet devient "ongoing"
 */
export function startOngoingTripTracking(tripInfo: OngoingTripInfo): void {
  console.log('[OngoingTripNotification] Démarrage suivi trajet:', tripInfo.tripId);
  
  currentTripInfo = tripInfo;

  // S'abonner aux changements d'état de l'application
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  }

  // Si l'app est déjà en arrière-plan, afficher la notification immédiatement
  if (AppState.currentState !== 'active') {
    showOngoingTripNotification(tripInfo);
  }
}

/**
 * Met à jour les informations du trajet en cours
 */
export function updateOngoingTripInfo(tripInfo: Partial<OngoingTripInfo>): void {
  if (!currentTripInfo) return;

  currentTripInfo = { ...currentTripInfo, ...tripInfo };

  // Mettre à jour la notification si elle est affichée
  if (isNotificationShown) {
    showOngoingTripNotification(currentTripInfo);
  }
}

/**
 * Arrête le suivi du trajet en cours
 * Appelé quand un trajet se termine ou est annulé
 */
export function stopOngoingTripTracking(): void {
  console.log('[OngoingTripNotification] Arrêt suivi trajet');

  currentTripInfo = null;

  // Masquer la notification
  hideOngoingTripNotification();

  // Se désabonner des changements d'état
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

/**
 * Vérifie si un trajet est actuellement suivi
 */
export function isTrackingOngoingTrip(): boolean {
  return currentTripInfo !== null;
}

/**
 * Récupère les infos du trajet actuellement suivi
 */
export function getCurrentTripInfo(): OngoingTripInfo | null {
  return currentTripInfo;
}

/**
 * Force l'affichage de la notification (utile pour les tests)
 */
export async function forceShowNotification(): Promise<void> {
  if (currentTripInfo) {
    await showOngoingTripNotification(currentTripInfo);
  }
}

/**
 * Force le masquage de la notification
 */
export async function forceHideNotification(): Promise<void> {
  await hideOngoingTripNotification();
}

