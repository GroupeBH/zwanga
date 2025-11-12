import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { selectTripById } from '@/store/selectors';
import { updateTrip } from '@/store/slices/tripsSlice';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';

export default function TripDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const dispatch = useAppDispatch();
  const { checkIdentity } = useIdentityCheck();
  const trip = useAppSelector(state => selectTripById(id as string)(state));
  const [expanded, setExpanded] = useState(false);
  
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (trip?.status === 'ongoing') {
      pulseAnim.value = withRepeat(
        withTiming(1.2, { duration: 1000 }),
        -1,
        true
      );
    }
  }, [trip?.status]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Trajet non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleCancelTrip = () => {
    Alert.alert(
      'Annuler le trajet',
      'Êtes-vous sûr de vouloir annuler ce trajet ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => {
            dispatch(updateTrip({ id: trip.id, updates: { status: 'cancelled' } }));
            Alert.alert('Trajet annulé', 'Le trajet a été annulé avec succès.', [
              { text: 'OK', onPress: () => router.back() }
            ]);
          },
        },
      ]
    );
  };

  const progress = trip.progress || 0;
  const statusConfig = {
    upcoming: { color: Colors.secondary, bgColor: 'rgba(247, 184, 1, 0.1)', label: 'À venir' },
    ongoing: { color: Colors.info, bgColor: 'rgba(52, 152, 219, 0.1)', label: 'En cours' },
    completed: { color: Colors.success, bgColor: 'rgba(46, 204, 113, 0.1)', label: 'Terminé' },
    cancelled: { color: Colors.gray[600], bgColor: Colors.gray[200], label: 'Annulé' },
  };

  const config = statusConfig[trip.status];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails du trajet</Text>
          <TouchableOpacity>
            <Ionicons name="ellipsis-vertical" size={24} color={Colors.gray[600]} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Carte interactive */}
        <TouchableOpacity
          style={styles.mapContainer}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.9}
        >
          <View style={[styles.map, expanded && styles.mapExpanded]}>
            {/* Carte simulée */}
            <View style={styles.mapContent}>
              {/* Grille de fond */}
              <View style={styles.mapGrid}>
                {[...Array(10)].map((_, i) => (
                  <View
                    key={`v-${i}`}
                    style={[styles.gridLine, { left: `${i * 10}%`, width: 1, height: '100%' }]}
                  />
                ))}
                {[...Array(10)].map((_, i) => (
                  <View
                    key={`h-${i}`}
                    style={[styles.gridLine, { top: `${i * 10}%`, height: 1, width: '100%' }]}
                  />
                ))}
              </View>

              {/* Marqueur départ */}
              <View style={styles.markerStart}>
                <View style={styles.markerStartCircle}>
                  <Ionicons name="location" size={20} color={Colors.white} />
                </View>
              </View>

              {/* Marqueur arrivée */}
              <View style={styles.markerEnd}>
                <View style={styles.markerEndCircle}>
                  <Ionicons name="navigate" size={20} color={Colors.white} />
                </View>
              </View>

              {/* Position actuelle (si en cours) */}
              {trip.status === 'ongoing' && (
                <Animated.View
                  style={[
                    pulseStyle,
                    styles.markerCurrent,
                    { left: `${30 + progress * 0.4}%`, top: `${40 + progress * 0.2}%` }
                  ]}
                >
                  <View style={styles.markerCurrentCircle}>
                    <Ionicons name="car" size={20} color={Colors.white} />
                  </View>
                </Animated.View>
              )}
            </View>

            {/* Bouton agrandir */}
            <View style={styles.expandButton}>
              <TouchableOpacity style={styles.expandButtonInner}>
                <Ionicons name={expanded ? 'contract' : 'expand'} size={20} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>

        {/* Statut du trajet */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusCard, { backgroundColor: config.bgColor }]}>
            <View style={styles.statusHeader}>
              <View style={styles.statusHeaderLeft}>
                <View style={[styles.statusDot, { backgroundColor: config.color }]} />
                <Text style={styles.statusLabel}>{config.label}</Text>
              </View>
              {trip.status === 'ongoing' && (
                <Text style={styles.progressText}>{progress}% complété</Text>
              )}
            </View>

            {trip.status === 'ongoing' && (
              <>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.etaText}>
                  Arrivée estimée: {trip.arrivalTime.getHours()}:{trip.arrivalTime.getMinutes().toString().padStart(2, '0')}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Itinéraire */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ITINÉRAIRE</Text>
            
            <View style={styles.routeContainer}>
              <View style={styles.routeIconContainer}>
                <View style={styles.routeIconStart}>
                  <Ionicons name="location" size={16} color={Colors.success} />
                </View>
                <View style={styles.routeDivider} />
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeName}>{trip.departure.name}</Text>
                <Text style={styles.routeAddress}>{trip.departure.address}</Text>
                <Text style={styles.routeTime}>
                  Départ: {trip.departureTime.getHours()}:{trip.departureTime.getMinutes().toString().padStart(2, '0')}
                </Text>
              </View>
            </View>

            <View style={styles.routeContainer}>
              <View style={styles.routeIconContainer}>
                <View style={styles.routeIconEnd}>
                  <Ionicons name="navigate" size={16} color={Colors.primary} />
                </View>
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeName}>{trip.arrival.name}</Text>
                <Text style={styles.routeAddress}>{trip.arrival.address}</Text>
                <Text style={styles.routeTime}>
                  Arrivée: {trip.arrivalTime.getHours()}:{trip.arrivalTime.getMinutes().toString().padStart(2, '0')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Informations du conducteur */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>CONDUCTEUR</Text>
            
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar} />
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>{trip.driverName}</Text>
                <View style={styles.driverMeta}>
                  <Ionicons name="star" size={16} color={Colors.secondary} />
                  <Text style={styles.driverRating}>{trip.driverRating}</Text>
                  <View style={styles.driverDot} />
                  <Text style={styles.driverVehicle}>{trip.vehicleInfo}</Text>
                </View>
              </View>
            </View>

            <View style={styles.driverActions}>
              <TouchableOpacity
                style={styles.driverActionButton}
                onPress={() => router.push(`/chat/${trip.driverId}`)}
              >
                <Ionicons name="chatbubble" size={20} color={Colors.primary} />
                <Text style={styles.driverActionText}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.driverActionButton, styles.driverActionButtonGreen]}>
                <Ionicons name="call" size={20} color={Colors.success} />
                <Text style={[styles.driverActionText, { color: Colors.success }]}>Appeler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Détails */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>DÉTAILS</Text>
            
            <View style={styles.detailsList}>
              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="people" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Places disponibles</Text>
                </View>
                <Text style={styles.detailValue}>{trip.availableSeats}/{trip.totalSeats}</Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="cash" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Prix</Text>
                </View>
                <Text style={[styles.detailValue, { color: Colors.success }]}>{trip.price} FC</Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="car" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Véhicule</Text>
                </View>
                <Text style={styles.detailValue}>{trip.vehicleInfo}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Actions */}
        {trip.status === 'upcoming' && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                // Vérifier l'identité avant de réserver
                if (checkIdentity('book')) {
                  Alert.alert('Réservation', 'Fonctionnalité en développement');
                }
              }}
            >
              <Text style={styles.actionButtonText}>Réserver ce trajet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelTrip}
            >
              <Text style={styles.cancelButtonText}>Annuler le trajet</Text>
            </TouchableOpacity>
          </View>
        )}

        {trip.status === 'completed' && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/rate/${trip.id}`)}
            >
              <Text style={styles.actionButtonText}>Évaluer le trajet</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  scrollView: {
    flex: 1,
  },
  mapContainer: {
    position: 'relative',
  },
  map: {
    height: 192,
    backgroundColor: Colors.gray[200],
  },
  mapExpanded: {
    height: 384,
  },
  mapContent: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#E3F2FD',
  },
  mapGrid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.2,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: Colors.gray[400],
  },
  markerStart: {
    position: 'absolute',
    left: '20%',
    top: '30%',
  },
  markerStartCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerEnd: {
    position: 'absolute',
    left: '70%',
    top: '60%',
  },
  markerEndCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCurrent: {
    position: 'absolute',
  },
  markerCurrentCircle: {
    width: 40,
    height: 40,
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowLg,
  },
  expandButton: {
    position: 'absolute',
    bottom: Spacing.lg,
    right: Spacing.lg,
  },
  expandButtonInner: {
    width: 40,
    height: 40,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowLg,
  },
  statusContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  statusCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  statusHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  statusLabel: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  progressText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.info,
  },
  etaText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  section: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  sectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  routeIconContainer: {
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  routeIconStart: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIconEnd: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeDivider: {
    width: 2,
    height: 48,
    backgroundColor: Colors.gray[300],
  },
  routeContent: {
    flex: 1,
  },
  routeName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.xs,
    fontSize: FontSizes.base,
  },
  routeAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  routeTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  driverAvatar: {
    width: 64,
    height: 64,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.lg,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.lg,
    marginBottom: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
    marginLeft: Spacing.xs,
    fontSize: FontSizes.base,
  },
  driverDot: {
    width: 4,
    height: 4,
    backgroundColor: Colors.gray[400],
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.sm,
  },
  driverVehicle: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  driverActions: {
    flexDirection: 'row',
  },
  driverActionButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  driverActionButtonGreen: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    marginRight: 0,
  },
  driverActionText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
  },
  detailsList: {
    marginTop: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    color: Colors.gray[700],
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
  },
  detailValue: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  actionsContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.danger,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
});
