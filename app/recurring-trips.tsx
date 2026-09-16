import { styles } from '../features/screen-styles/app/recurring-trips/index';
import { Colors } from '@/constants/styles';
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
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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


