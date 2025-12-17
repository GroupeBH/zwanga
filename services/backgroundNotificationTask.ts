import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { handleIncomingNotification } from './pushNotifications';

/**
 * Nom de la tâche de fond pour les notifications push
 * Ce nom doit être unique et cohérent dans toute l'application
 * Il doit correspondre au nom configuré dans app.config.js
 */
export const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

const isExpoGo = Constants.appOwnership === 'expo';

// Importer TaskManager de manière conditionnelle pour éviter les erreurs dans Expo Go
let TaskManager: typeof import('expo-task-manager') | null = null;

try {
  if (!isExpoGo) {
    TaskManager = require('expo-task-manager');
  }
} catch (error) {
  console.warn('expo-task-manager n\'est pas disponible. Les notifications en arrière-plan ne fonctionneront pas dans Expo Go.');
}

/**
 * Tâche de fond pour traiter les notifications push reçues en arrière-plan
 * Cette fonction sera exécutée même quand l'application est fermée
 * 
 * Note: Cette tâche est déclenchée automatiquement par expo-notifications
 * quand une notification est reçue en arrière-plan (app fermée ou en arrière-plan)
 * 
 * IMPORTANT: Cette fonction doit être définie AVANT que l'application ne démarre,
 * c'est pourquoi elle est définie au niveau racine du module.
 */
if (TaskManager) {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      console.error('Erreur dans la tâche de notification en arrière-plan:', error);
      return;
    }

    if (!data) {
      console.warn('Aucune donnée reçue dans la tâche de notification');
      return;
    }

    // Les données de notification sont passées via le paramètre data
    // expo-notifications passe les données sous la forme { notification: Notification }
    const taskData = data as { notification?: Notifications.Notification; [key: string]: any };

    if (taskData.notification) {
      // Notification expo-notifications standard
      const notification = taskData.notification;
      // Vérifier que la notification a une structure valide
      if (notification && notification.request && notification.request.content) {
        await handleIncomingNotification(notification);
        const identifier = notification.request?.identifier || 'unknown';
        console.log('Notification expo-notifications traitée en arrière-plan:', identifier);
      } else {
        console.warn('Notification invalide reçue (structure manquante):', notification);
      }
    } else if (taskData.title || taskData.body) {
      // Notification FCM directe (format alternatif)
      const notification: Notifications.Notification = {
        request: {
          identifier: taskData.id || `bg-${Date.now()}`,
          content: {
            title: taskData.title || 'Zwanga',
            subtitle: null,
            body: taskData.body || '',
            data: taskData.data || {},
            categoryIdentifier: null,
            sound: 'default',
            badge: taskData.badge,
          },
          trigger: null,
        },
        date: Date.now(),
      };
      await handleIncomingNotification(notification);
      console.log('Notification FCM traitée en arrière-plan:', notification.request.identifier);
    } else {
      console.warn('Format de notification non reconnu:', taskData);
    }
  } catch (error) {
    console.error('Erreur lors du traitement de la notification en arrière-plan:', error);
    // Ne pas propager l'erreur pour éviter de bloquer le système de notifications
  }
  });
}

/**
 * Enregistre la tâche de fond pour les notifications push
 * Cette fonction doit être appelée au démarrage de l'application
 * 
 * @returns true si l'enregistrement a réussi, false sinon
 */
export async function registerBackgroundNotificationTask(): Promise<boolean> {
  try {
    if (!TaskManager || isExpoGo) {
      console.warn('Task Manager n\'est pas disponible. Les notifications en arrière-plan nécessitent un build de développement ou EAS.');
      return false;
    }

    // Vérifier si la tâche est déjà enregistrée
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    
    if (isRegistered) {
      console.log('La tâche de notification en arrière-plan est déjà enregistrée');
      return true;
    }

    // Enregistrer la tâche avec expo-notifications
    // Cette méthode lie la tâche Task Manager aux notifications push
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    
    console.log('Tâche de notification en arrière-plan enregistrée avec succès');
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la tâche de notification:', error);
    return false;
  }
}

/**
 * Désenregistre la tâche de fond pour les notifications push
 * Utile pour le nettoyage ou la déconnexion
 */
export async function unregisterBackgroundNotificationTask(): Promise<void> {
  try {
    if (!TaskManager || isExpoGo) {
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    
    if (isRegistered) {
      await TaskManager.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      console.log('Tâche de notification en arrière-plan désenregistrée');
    }
  } catch (error) {
    console.error('Erreur lors du désenregistrement de la tâche de notification:', error);
  }
}

/**
 * Vérifie si la tâche de fond est enregistrée
 * 
 * @returns true si la tâche est enregistrée, false sinon
 */
export async function isBackgroundNotificationTaskRegistered(): Promise<boolean> {
  try {
    if (!TaskManager || isExpoGo) {
      return false;
    }
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch (error) {
    console.error('Erreur lors de la vérification de la tâche:', error);
    return false;
  }
}
