import {
  BorderRadius,
  Colors,
  CommonStyles,
  FontSizes,
  FontWeights,
  Spacing,
} from '@/constants/styles';
import { trackEvent } from '@/services/analytics';
import {
  useGetMyRecurringTripsQuery,
  usePauseRecurringTripMutation,
  useResumeRecurringTripMutation,
} from '@/store/api/tripApi';
import type { RecurringTripTemplate } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mer',
  4: 'Jeu',
  5: 'Ven',
  6: 'Sam',
  7: 'Dim',
};

const formatDateTimeLabel = (value?: string | null) => {
  if (!value) return 'Aucune publication prévue pour le moment';
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return 'Sans fin';
  const [year, month, day] = value.split('-').map((item) => Number(item));
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
};

const formatWeekdays = (weekdays: number[]) => {
  return weekdays.map((day) => WEEKDAY_LABELS[day] ?? `${day}`);
};

const statusConfig = (status: RecurringTripTemplate['status']) => {
  if (status === 'paused') {
    return {
      badgeBackground: 'rgba(99, 110, 114, 0.14)',
      badgeColor: Colors.gray[700],
      label: 'En pause',
      actionLabel: 'Relancer',
      actionBackground: Colors.primary,
      actionColor: Colors.white,
      icon: 'play',
    } as const;
  }

  return {
    badgeBackground: 'rgba(46, 204, 113, 0.14)',
    badgeColor: Colors.success,
    label: 'Actif',
    actionLabel: 'Mettre en pause',
    actionBackground: Colors.white,
    actionColor: Colors.gray[800],
    icon: 'pause',
  } as const;
};

export default function RecurringTripsScreen() {
  const router = useRouter();
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const {
    data: recurringTrips = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetMyRecurringTripsQuery();
  const [pauseRecurringTrip] = usePauseRecurringTripMutation();
  const [resumeRecurringTrip] = useResumeRecurringTripMutation();

  const activeCount = useMemo(
    () => recurringTrips.filter((trip) => trip.status === 'active').length,
    [recurringTrips],
  );
  const pausedCount = useMemo(
    () => recurringTrips.filter((trip) => trip.status === 'paused').length,
    [recurringTrips],
  );

  const handleToggleStatus = async (template: RecurringTripTemplate) => {
    if (pendingTemplateId) return;

    try {
      setPendingTemplateId(template.id);
      if (template.status === 'paused') {
        await resumeRecurringTrip(template.id).unwrap();
        void trackEvent('recurring_trip_resumed', {
          recurring_trip_id: template.id,
        });
      } else {
        await pauseRecurringTrip(template.id).unwrap();
        void trackEvent('recurring_trip_paused', {
          recurring_trip_id: template.id,
        });
      }
    } finally {
      setPendingTemplateId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Trajets réguliers</Text>
          <Text style={styles.headerSubtitle}>
            Publiez automatiquement les trajets que vous faites souvent.
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIcon}>
              <Ionicons name="repeat" size={20} color={Colors.primary} />
            </View>
            <TouchableOpacity
              style={styles.heroAction}
              onPress={() => router.push({ pathname: '/publish', params: { mode: 'recurring' } })}
            >
              <Text style={styles.heroActionText}>Créer</Text>
              <Ionicons name="add" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.heroTitle}>Publication automatique</Text>
          <Text style={styles.heroText}>
            Enregistrez une route habituelle: maison, travail, école ou marché. Zwanga publie
            le trajet les jours choisis.
          </Text>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{activeCount}</Text>
              <Text style={styles.heroStatLabel}>Actifs</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{pausedCount}</Text>
              <Text style={styles.heroStatLabel}>En pause</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{recurringTrips.length}</Text>
              <Text style={styles.heroStatLabel}>Total</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
          <Text style={styles.infoText}>
            En pause = Zwanga ne publie plus de nouveaux trajets. Les trajets déjà publiés
            restent visibles dans Mes trajets.
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loaderCard}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loaderText}>Chargement des trajets récurrents...</Text>
          </View>
        ) : recurringTrips.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="repeat" size={34} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Aucun trajet récurrent</Text>
            <Text style={styles.emptyText}>
              Créez un trajet régulier pour vos déplacements habituels: travail, école,
              université ou marché.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push({ pathname: '/publish', params: { mode: 'recurring' } })}
            >
              <Text style={styles.emptyButtonText}>Créer un trajet régulier</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recurringTrips.map((template) => {
            const config = statusConfig(template.status);
            const isPending = pendingTemplateId === template.id;

            return (
              <View key={template.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.routeBlock}>
                    <View style={styles.routeStopRow}>
                      <View style={[styles.routeDot, styles.routeDotDeparture]} />
                      <View style={styles.routeStopContent}>
                        <Text style={styles.routeLabel}>Départ</Text>
                        <Text style={styles.routeTitle} numberOfLines={1}>
                          {template.departure.name}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.routeLine} />
                    <View style={styles.routeStopRow}>
                      <View style={[styles.routeDot, styles.routeDotArrival]} />
                      <View style={styles.routeStopContent}>
                        <Text style={styles.routeLabel}>Arrivée</Text>
                        <Text style={styles.routeTitle} numberOfLines={1}>
                          {template.arrival.name}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: config.badgeBackground },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: config.badgeColor }]}>
                      {config.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.scheduleLabelRow}>
                  <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
                  <Text style={styles.scheduleLabel}>Jours de publication</Text>
                </View>
                <View style={styles.dayChipsRow}>
                  {formatWeekdays(template.weekdays).map((label) => (
                    <View key={`${template.id}-${label}`} style={styles.dayChip}>
                      <Text style={styles.dayChipText}>{label}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Heure de départ</Text>
                    <Text style={styles.detailValue}>{template.departureTime}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Places dispo</Text>
                    <Text style={styles.detailValue}>{template.totalSeats}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Prix/place</Text>
                    <Text style={styles.detailValue}>
                      {template.isFree ? 'Gratuit' : `${template.pricePerSeat} FC`}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Jusqu’au</Text>
                    <Text style={styles.detailValue}>{formatDateLabel(template.endDate)}</Text>
                  </View>
                </View>

                <View style={styles.nextTripCard}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                  <View style={styles.nextTripContent}>
                    <Text style={styles.nextTripLabel}>Prochaine publication</Text>
                    <Text style={styles.nextTripValue}>
                      {formatDateTimeLabel(template.nextOccurrenceDate)}
                    </Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>
                      {template.upcomingGeneratedTripsCount}
                    </Text>
                    <Text style={styles.countBadgeLabel}>créés</Text>
                  </View>
                </View>

                {template.vehicle ? (
                  <View style={styles.vehicleRow}>
                    <Ionicons name="car-outline" size={16} color={Colors.gray[600]} />
                    <Text style={styles.vehicleText}>
                      {template.vehicle.brand} {template.vehicle.model} - {template.vehicle.color}
                    </Text>
                  </View>
                ) : null}

                {template.description ? (
                  <Text style={styles.descriptionText}>{template.description}</Text>
                ) : null}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.manageButton,
                      { backgroundColor: config.actionBackground },
                      template.status === 'active' && styles.pauseButton,
                      isPending && styles.disabledButton,
                    ]}
                    onPress={() => handleToggleStatus(template)}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <ActivityIndicator color={config.actionColor} />
                    ) : (
                      <>
                        <Ionicons name={config.icon} size={16} color={config.actionColor} />
                        <Text style={[styles.manageButtonText, { color: config.actionColor }]}>
                          {config.actionLabel}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
    marginRight: Spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.primary + '18',
    padding: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '12',
  },
  heroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '24',
  },
  heroActionText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  heroTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  heroText: {
    marginTop: Spacing.xs,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    color: Colors.primary,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  heroStatLabel: {
    marginTop: 2,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.gray[100],
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  infoText: {
    flex: 1,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  loaderCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  loaderText: {
    marginTop: Spacing.md,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: BorderRadius.xxl,
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '12',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  emptyText: {
    marginTop: Spacing.sm,
    textAlign: 'center',
    color: Colors.gray[600],
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  emptyButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  routeBlock: {
    flex: 1,
    gap: 2,
  },
  routeStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeStopContent: {
    flex: 1,
    minWidth: 0,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.sm,
  },
  routeDotDeparture: {
    backgroundColor: Colors.success,
  },
  routeDotArrival: {
    backgroundColor: Colors.primary,
  },
  routeLine: {
    width: 2,
    height: 18,
    marginLeft: 5,
    backgroundColor: Colors.gray[200],
  },
  routeLabel: {
    color: Colors.gray[500],
    fontSize: 10,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  routeTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  scheduleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  scheduleLabel: {
    color: Colors.gray[700],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  dayChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  dayChip: {
    minHeight: 30,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
  },
  dayChipText: {
    color: Colors.gray[700],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.md,
    rowGap: Spacing.sm,
  },
  detailItem: {
    width: '50%',
  },
  detailLabel: {
    color: Colors.gray[500],
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: FontWeights.bold,
  },
  detailValue: {
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  nextTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '10',
    gap: Spacing.sm,
  },
  nextTripContent: {
    flex: 1,
  },
  nextTripLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
  },
  nextTripValue: {
    marginTop: 2,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  countBadge: {
    minWidth: 42,
    minHeight: 38,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xs,
  },
  countBadgeText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  countBadgeLabel: {
    color: Colors.gray[500],
    fontSize: 9,
    fontWeight: FontWeights.semibold,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  vehicleText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  descriptionText: {
    marginTop: Spacing.md,
    color: Colors.gray[600],
    lineHeight: 21,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  manageButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  manageButtonText: {
    fontWeight: FontWeights.bold,
  },
  pauseButton: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  disabledButton: {
    opacity: 0.6,
  },
});
