import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';
import {
  useGetNotificationsQuery,
  useMarkNotificationsAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useDisableNotificationsMutation,
} from '@/store/api/notificationApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import type { Notification } from '@/types';
import { formatDateTime, formatRelativeTime } from '@/utils/dateHelpers';
import { useDialog } from '@/components/ui/DialogProvider';

const notificationTypeConfig: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string; background: string }
> = {
  booking: {
    icon: 'car-outline',
    color: Colors.primary,
    background: Colors.primary + '18',
  },
  message: {
    icon: 'chatbubble-ellipses-outline',
    color: Colors.info,
    background: Colors.info + '18',
  },
  warning: {
    icon: 'warning-outline',
    color: Colors.danger,
    background: Colors.danger + '18',
  },
  default: {
    icon: 'notifications-outline',
    color: Colors.gray[700],
    background: Colors.gray[200],
  },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const { data: currentUser } = useGetCurrentUserQuery();
  const {
    data: notificationsData,
    isLoading,
    isFetching,
    refetch,
  } = useGetNotificationsQuery();
  const [markNotificationsAsRead] = useMarkNotificationsAsReadMutation();
  const [markAllAsRead] = useMarkAllNotificationsAsReadMutation();
  const [disableNotifications] = useDisableNotificationsMutation();
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const notifications = notificationsData?.notifications ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;

  // Fonction pour déterminer si l'utilisateur connecté est le conducteur du trajet
  const isUserDriverOfTrip = (data: Record<string, any>): boolean => {
    if (!currentUser?.id || !data.tripId) return false;
    
    // Si les données contiennent driverId, vérifier directement
    if (data.driverId) {
      return String(data.driverId) === String(currentUser.id);
    }
    
    // Si les données contiennent l'objet trip avec driverId
    if (data.trip?.driverId) {
      return String(data.trip.driverId) === String(currentUser.id);
    }
    
    return false;
  };

  // Fonction pour déterminer l'URL du trajet (manage ou détail)
  const getTripUrl = (tripId: string, data: Record<string, any>): string => {
    // Si l'utilisateur est le conducteur du trajet, rediriger vers la page de gestion
    if (isUserDriverOfTrip(data)) {
      return `/trip/manage/${tripId}`;
    }
    // Sinon, rediriger vers la page de détail
    return `/trip/${tripId}`;
  };

  // Fonction pour détecter si c'est une notification explicitement pour un conducteur
  const isDriverNotification = (type: string): boolean => {
    const driverTypes = [
      'trip_expiring',
      'driver_reminder',
      'booking_pending', // Une nouvelle réservation pour le conducteur
      'trip_starting_soon',
    ];
    return driverTypes.includes(type);
  };

  // Fonction helper pour extraire l'ID du trip-request depuis différentes structures de données
  const extractTripRequestId = (data: Record<string, any>): string | null => {
    // Chercher dans différentes variantes possibles
    if (data.requestId) return String(data.requestId);
    if (data.tripRequestId) return String(data.tripRequestId);
    if (data.trip_request_id) return String(data.trip_request_id);
    if (data.tripRequest?.id) return String(data.tripRequest.id);
    if (data.trip_request?.id) return String(data.trip_request.id);
    if (data.data?.requestId) return String(data.data.requestId);
    if (data.data?.tripRequestId) return String(data.data.tripRequestId);
    if (data.data?.trip_request_id) return String(data.data.trip_request_id);
    if (data.data?.tripRequest?.id) return String(data.data.tripRequest.id);
    if (data.data?.trip_request?.id) return String(data.data.trip_request.id);
    
    // Log pour déboguer si aucun ID trouvé
    console.log('[NotificationsScreen] Aucun ID de trip-request trouvé dans:', data);
    return null;
  };

  const handleSelectNotification = async (notification: Notification) => {
    // Marquer comme lu et désactiver (faire disparaître) la notification
    try {
      // Marquer comme lu d'abord
      if (!notification.isRead) {
        await markNotificationsAsRead({ notificationIds: [notification.id] }).unwrap();
      }
      // Désactiver la notification pour qu'elle disparaisse de la liste
      await disableNotifications({ notificationIds: [notification.id] }).unwrap();
    } catch (error) {
      console.warn('Impossible de marquer la notification comme lue ou de la désactiver:', error);
    }

    // Naviguer vers l'écran approprié selon le type de notification
    const data = notification.data || {};
    const { type, tripId, bookingId, conversationId } = data;
    
    // Extraire l'ID du trip-request de manière robuste
    const requestId = extractTripRequestId(data);
    
    // Log pour déboguer
    console.log('[NotificationsScreen] Notification sélectionnée:', { type, tripId, bookingId, conversationId, requestId, data });

    try {
      // Attendre un court délai pour que la navigation soit fluide
      setTimeout(() => {
        // Gérer les notifications de trajets
        if (type === 'trip' || type === 'trip_update') {
          if (tripId) {
            router.push(getTripUrl(tripId, data));
            return;
          }
        }

        // Gérer les notifications de réservations
        if (
          type === 'booking' ||
          type === 'booking_accepted' ||
          type === 'booking_rejected' ||
          type === 'booking_cancelled' ||
          type === 'booking_pending'
        ) {
          if (tripId) {
            router.push(getTripUrl(tripId, data));
            return;
          } else if (bookingId) {
            router.push('/bookings');
            return;
          }
        }

        // Gérer les notifications de messages
        if (type === 'message' || type === 'chat') {
          if (conversationId) {
            router.push({
              pathname: '/chat/[id]',
              params: { id: conversationId },
            });
            return;
          }
        }

        // Gérer les notifications de gestion de trajet
        if (type === 'trip_manage') {
          if (tripId) {
            router.push(`/trip/manage/${tripId}`);
            return;
          }
        }

        // Gérer les notifications explicitement pour conducteurs
        if (isDriverNotification(type) && tripId) {
          router.push(`/trip/manage/${tripId}`);
          return;
        }

        // Gérer les notifications de demandes de trajet
        // Vérifier d'abord si c'est une notification de demande de trajet (par type ou par présence de requestId)
        // Gérer les variantes avec underscore et tiret
        const isTripRequestNotification = 
          type === 'trip_request' ||
          type === 'trip-request' ||
          type === 'trip_request_accepted' ||
          type === 'trip-request-accepted' ||
          type === 'trip_request_rejected' ||
          type === 'trip-request-rejected' ||
          type === 'trip_request_cancelled' ||
          type === 'trip-request-cancelled' ||
          type === 'trip_request_pending' ||
          type === 'trip-request-pending' ||
          type === 'new_trip_request' ||
          type === 'new-trip-request' ||
          type === 'trip_request_new' ||
          type === 'trip-request-new' ||
          (typeof type === 'string' && type.toLowerCase().includes('trip') && type.toLowerCase().includes('request')) ||
          (requestId && !tripId && !bookingId && !conversationId); // Si seul requestId est présent, c'est probablement une demande
        
        if (isTripRequestNotification) {
          console.log('[NotificationsScreen] Notification de demande de trajet détectée, requestId:', requestId);
          if (requestId) {
            console.log('[NotificationsScreen] Navigation vers /request/' + requestId);
            try {
              router.push({
                pathname: '/request/[id]',
                params: { id: requestId },
              });
            } catch (error) {
              console.error('[NotificationsScreen] Erreur lors de la navigation:', error);
              // Fallback avec le format direct
              router.push(`/request/${requestId}`);
            }
            return;
          } else if (tripId) {
            // Si une demande a créé un trajet, naviguer vers le trajet
            console.log('[NotificationsScreen] Navigation vers /trip/' + tripId);
            router.push(`/trip/${tripId}`);
            return;
          }
          console.warn('[NotificationsScreen] Notification de demande de trajet sans requestId ni tripId');
          // Si c'est une notification de demande de trajet mais sans ID, ne pas ouvrir le modal
          // Retourner directement pour éviter d'afficher le modal
          return;
        }

        // Gérer les notifications d'avis
        if (type === 'rate' || type === 'review') {
          if (tripId) {
            router.push(`/rate/${tripId}`);
            return;
          }
        }

        // Fallback : naviguer selon les IDs disponibles même sans type spécifique
        // Vérifier requestId AVANT tripId pour éviter de naviguer vers un trajet au lieu d'une demande
        // Ré-extraire l'ID au cas où il n'aurait pas été trouvé précédemment
        const fallbackRequestId = requestId || extractTripRequestId(data);
        if (fallbackRequestId) {
          console.log('[NotificationsScreen] Fallback: Navigation vers /request/' + fallbackRequestId);
          try {
            router.push({
              pathname: '/request/[id]',
              params: { id: fallbackRequestId },
            });
          } catch (error) {
            console.error('[NotificationsScreen] Erreur lors de la navigation (fallback):', error);
            // Fallback avec le format direct
            router.push(`/request/${fallbackRequestId}`);
          }
          return;
        }
        if (tripId) {
          router.push(getTripUrl(tripId, data));
          return;
        }
        if (conversationId) {
          router.push({
            pathname: '/chat/[id]',
            params: { id: conversationId },
          });
          return;
        }
        if (bookingId) {
          router.push('/bookings');
          return;
        }

        // Si aucun type spécifique ou navigation impossible, ouvrir le modal
        setSelectedNotification(notification);
      }, 100);
    } catch (error) {
      console.warn('Erreur lors de la navigation depuis la notification:', error);
      // En cas d'erreur, ouvrir le modal
      setSelectedNotification(notification);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead().unwrap();
    } catch (error) {
      console.warn('Impossible de marquer toutes les notifications comme lues:', error);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    try {
      await disableNotifications({ notificationIds: [notificationId] }).unwrap();
      // Fermer le swipeable après suppression
      swipeableRefs.current.get(notificationId)?.close();
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || 'Impossible de supprimer la notification',
      });
    }
  };

  const handleDeleteAllNotifications = () => {
    if (notifications.length === 0) {
      return;
    }

    showDialog({
      variant: 'warning',
      title: 'Supprimer toutes les notifications',
      message: `Êtes-vous sûr de vouloir supprimer toutes les ${notifications.length} notification${notifications.length > 1 ? 's' : ''} ? Cette action est irréversible.`,
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Supprimer tout',
          variant: 'primary',
          onPress: async () => {
            try {
              const allNotificationIds = notifications.map((n) => n.id);
              await disableNotifications({ notificationIds: allNotificationIds }).unwrap();
              showDialog({
                variant: 'success',
                title: 'Notifications supprimées',
                message: 'Toutes les notifications ont été supprimées avec succès.',
              });
            } catch (error: any) {
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: error?.data?.message || 'Impossible de supprimer les notifications',
              });
            }
          },
        },
      ],
    });
  };

  const renderRightActions = (notification: Notification) => {
    return (
      <View style={styles.rightActionContainer}>
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => {
            handleDeleteNotification(notification.id);
          }}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.white} />
          <Text style={styles.deleteActionText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderLeftActions = (notification: Notification) => {
    return (
      <View style={styles.leftActionContainer}>
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => {
            handleDeleteNotification(notification.id);
          }}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.white} />
          <Text style={styles.deleteActionText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNotificationData = (data: Record<string, any>) => {
    const dataEntries = Object.entries(data);
    
    // Mapper les clés communes à des labels lisibles
    const keyLabels: Record<string, string> = {
      type: 'Type',
      tripId: 'ID Trajet',
      bookingId: 'ID Réservation',
      conversationId: 'ID Conversation',
      userId: 'ID Utilisateur',
      message: 'Message',
      status: 'Statut',
    };

    return (
      <View style={styles.dataList}>
        {dataEntries.map(([key, value]) => {
          const label = keyLabels[key] || key.charAt(0).toUpperCase() + key.slice(1);
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          
          return (
            <View key={key} style={styles.dataRow}>
              <Text style={styles.dataLabel}>{label}:</Text>
              <Text style={styles.dataValue} numberOfLines={3}>
                {displayValue}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderNotificationCard = (notification: Notification) => {
    // Déterminer le type de notification depuis les données
    const notificationType = notification.data?.type || 'default';
    const config = notificationTypeConfig[notificationType] ?? notificationTypeConfig.default;
    const isUnread = !notification.isRead;

    return (
      <Swipeable
        key={notification.id}
        ref={(ref) => {
          if (ref) {
            swipeableRefs.current.set(notification.id, ref);
          } else {
            swipeableRefs.current.delete(notification.id);
          }
        }}
        renderRightActions={() => renderRightActions(notification)}
        renderLeftActions={() => renderLeftActions(notification)}
        onSwipeableWillOpen={() => {
          // Fermer les autres swipeables ouverts
          swipeableRefs.current.forEach((ref, id) => {
            if (id !== notification.id && ref) {
              ref.close();
            }
          });
        }}
        friction={2}
        overshootRight={false}
        overshootLeft={false}
      >
        <TouchableOpacity
          style={[styles.notificationCard, isUnread && styles.notificationCardUnread]}
          onPress={() => handleSelectNotification(notification)}
          activeOpacity={0.85}
        >
          <View style={[styles.notificationIcon, { backgroundColor: config.background }]}>
            <Ionicons name={config.icon} size={20} color={config.color} />
          </View>
          <View style={styles.notificationContent}>
            <View style={styles.notificationHeader}>
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              <Text style={styles.notificationTime}>{formatRelativeTime(notification.createdAt)}</Text>
            </View>
            <Text style={styles.notificationMessage} numberOfLines={2}>
              {notification.body}
            </Text>
          </View>
          {isUnread && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSubtitle}>{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllAsRead}>
              <Ionicons name="checkmark-done" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity style={styles.deleteAllButton} onPress={handleDeleteAllNotifications}>
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()}>
            {isFetching ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={Colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderText}>Chargement des notifications...</Text>
          </View>
        ) : notifications && notifications.length > 0 ? (
          notifications.map((notification) => renderNotificationCard(notification))
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={40} color={Colors.gray[500]} />
            </View>
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptyDescription}>
              Nous vous préviendrons dès qu’il y aura quelque chose de nouveau.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal animationType="fade" transparent visible={selectedNotification !== null}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedNotification?.title}</Text>
              <TouchableOpacity onPress={() => setSelectedNotification(null)}>
                <Ionicons name="close" size={22} color={Colors.gray[700]} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTime}>
              Reçu {selectedNotification ? formatDateTime(selectedNotification.createdAt) : ''}
            </Text>
            <Text style={styles.modalMessage}>{selectedNotification?.body}</Text>
            {selectedNotification?.data && renderNotificationData(selectedNotification.data)}
            <View style={styles.modalActions}>
              {(() => {
                const data = selectedNotification?.data || {};
                const { type, tripId, bookingId, conversationId, requestId } = data;
                
                // Déterminer si on peut naviguer selon le type de notification
                // Afficher le bouton si on a au moins un ID disponible
                const canNavigate = Boolean(
                  tripId || 
                  bookingId || 
                  conversationId || 
                  requestId
                );

                if (canNavigate) {
                  return (
                    <>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.modalSecondaryButton]}
                        onPress={() => {
                          try {
                            // Fermer le modal d'abord
                            setSelectedNotification(null);
                            
                            // Naviguer selon le type et les IDs disponibles
                            // Priorité 1 : Types spécifiques
                            if (type === 'trip_manage' && tripId) {
                              router.push(`/trip/manage/${tripId}`);
                            } else if ((type === 'message' || type === 'chat') && conversationId) {
                              router.push({
                                pathname: '/chat/[id]',
                                params: { id: conversationId },
                              });
            } else if (
              type === 'trip_request' ||
              type === 'trip-request' ||
              type === 'trip_request_accepted' ||
              type === 'trip-request-accepted' ||
              type === 'trip_request_rejected' ||
              type === 'trip-request-rejected' ||
              type === 'trip_request_cancelled' ||
              type === 'trip-request-cancelled' ||
              type === 'trip_request_pending' ||
              type === 'trip-request-pending' ||
              type === 'new_trip_request' ||
              type === 'new-trip-request' ||
              type === 'trip_request_new' ||
              type === 'trip-request-new'
            ) {
              const modalRequestId = extractTripRequestId(data);
              if (modalRequestId) {
                router.push(`/request/${modalRequestId}`);
              }
                            } else if ((type === 'rate' || type === 'review') && tripId) {
                              router.push(`/rate/${tripId}`);
                            } else if (
                              (type === 'booking' ||
                                type === 'booking_accepted' ||
                                type === 'booking_rejected' ||
                                type === 'booking_cancelled' ||
                                type === 'booking_pending') &&
                              tripId
                            ) {
                              router.push(getTripUrl(tripId, data));
                            } else if ((type === 'trip' || type === 'trip_update') && tripId) {
                              router.push(getTripUrl(tripId, data));
                            } else if (isDriverNotification(type) && tripId) {
                              router.push(`/trip/manage/${tripId}`);
                            }
                            // Priorité 2 : Fallback selon les IDs disponibles
                            // Vérifier requestId AVANT tripId pour éviter de naviguer vers un trajet au lieu d'une demande
                            else if (requestId) {
                              router.push(`/request/${requestId}`);
                            } else if (tripId) {
                              router.push(getTripUrl(tripId, data));
                            } else if (conversationId) {
                              router.push({
                                pathname: '/chat/[id]',
                                params: { id: conversationId },
                              });
                            } else if (bookingId) {
                              router.push('/bookings');
                            }
                          } catch (error) {
                            console.warn('Erreur lors de la navigation:', error);
                          }
                        }}
                      >
                        <Text style={styles.modalSecondaryText}>Voir</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.modalPrimaryButton]}
                        onPress={() => setSelectedNotification(null)}
                      >
                        <Text style={styles.modalPrimaryText}>Fermer</Text>
                      </TouchableOpacity>
                    </>
                  );
                }
                return (
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalPrimaryButton]}
                    onPress={() => setSelectedNotification(null)}
                  >
                    <Text style={styles.modalPrimaryText}>Fermer</Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  markAllButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAllButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
    backgroundColor: Colors.danger + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  notificationCardUnread: {
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  notificationTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    flex: 1,
    marginRight: Spacing.sm,
  },
  notificationTime: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  notificationMessage: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    marginLeft: Spacing.sm,
  },
  loaderContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  loaderText: {
    marginTop: Spacing.sm,
    color: Colors.gray[500],
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.xs,
  },
  emptyDescription: {
    color: Colors.gray[600],
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    flex: 1,
    marginRight: Spacing.sm,
  },
  modalTime: {
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  modalMessage: {
    color: Colors.gray[700],
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  modalButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  modalPrimaryButton: {
    backgroundColor: Colors.primary,
  },
  modalPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  modalSecondaryButton: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  modalSecondaryText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  modalData: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
  },
  modalDataTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  dataList: {
    gap: Spacing.xs,
  },
  dataRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  dataLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    minWidth: 120,
    marginRight: Spacing.sm,
  },
  dataValue: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  rightActionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: Spacing.md,
  },
  leftActionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: Spacing.md,
  },
  deleteAction: {
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
    borderRadius: BorderRadius.xl,
    marginHorizontal: Spacing.xs,
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  deleteActionText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});

