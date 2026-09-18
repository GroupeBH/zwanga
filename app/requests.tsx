import { useRequestCards } from '../hooks/requests/useRequestCards';
import { styles } from '../features/screen-styles/app/requests/index';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { rankRequestsByProximity } from '@/features/trip-request/requestPriority';
import { useAppSelector } from '@/store/hooks';
import { selectUserCoordinates } from '@/store/selectors';
import { Colors } from '@/constants/styles';
import { useGetAvailableTripRequestsQuery, useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { getTripRequestCreateHref, getTripRequestDetailHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RequestTab = 'available' | 'my-requests';

export default function TripRequestsScreen() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const { data: currentUser } = useGetCurrentUserQuery();
  const driverCoordinate = useAppSelector(selectUserCoordinates);
  const isDriverAccount = Boolean(
    currentUser?.isDriver ||
      currentUser?.role === 'driver' ||
      currentUser?.role === 'both',
  );
  const [activeTab, setActiveTab] = useState<RequestTab>('available');

  // Query pour les demandes disponibles (pour les drivers)
  const {
    data: availableRequests = [],
    isLoading: isLoadingAvailable,
    isFetching: isFetchingAvailable,
    refetch: refetchAvailable,
  } = useGetAvailableTripRequestsQuery(undefined, {
    skip: activeTab !== 'available',
    // Polling léger pour les demandes disponibles (conducteurs)
    pollingInterval: isScreenActive ? (activeTab === 'available' ? 60_000 : 0) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  // Query pour mes demandes (pour les passagers)
  const {
    data: myRequests = [],
    isLoading: isLoadingMyRequests,
    isFetching: isFetchingMyRequests,
    refetch: refetchMyRequests,
  } = useGetMyTripRequestsQuery(undefined, {
    skip: activeTab !== 'my-requests',
    // Polling léger pour mes demandes (passagers)
    pollingInterval: isScreenActive ? (activeTab === 'my-requests' ? 60_000 : 0) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const filteredAvailableRequests = useMemo(
    () => rankRequestsByProximity(
      availableRequests.filter((request) => request.passengerId !== currentUser?.id),
      driverCoordinate,
    ),
    [availableRequests, currentUser?.id, driverCoordinate]
  );

  const requestsCount = {
    available: filteredAvailableRequests.length,
    my: myRequests.length,
  };

  const activeTabMeta =
    activeTab === 'available'
      ? {
          eyebrow: 'Demandes disponibles',
          title: 'Demandes publiées par d’autres passagers',
          description:
            'Vous voyez ici uniquement les demandes créées par d’autres utilisateurs. Ouvrez-en une pour vérifier le trajet puis l’accepter.',
          countLabel: `${requestsCount.available} disponible${requestsCount.available > 1 ? 's' : ''}`,
        }
      : {
          eyebrow: 'Mes demandes',
          title: 'Demandes que vous avez vous-même créées',
          description:
            'Retrouvez ici vos propres demandes, les réponses reçues et le suivi de votre prise en charge.',
          countLabel: `${requestsCount.my} demande${requestsCount.my > 1 ? 's' : ''}`,
        };

  const handleRequestPress = useCallback((requestId: string) => {
    router.push(getTripRequestDetailHref(requestId));
  }, [router]);

  // Rendre une carte de demande disponible (pour les drivers)
  const { renderAvailableRequestCard, renderMyRequestCard } = useRequestCards({
    handleRequestPress,
    isDriverAccount,
  });

  const isLoading = activeTab === 'available' ? isLoadingAvailable : isLoadingMyRequests;
  const isFetching = activeTab === 'available' ? isFetchingAvailable : isFetchingMyRequests;

  const currentData = activeTab === 'available' ? filteredAvailableRequests : myRequests;
  const refetch = activeTab === 'available' ? refetchAvailable : refetchMyRequests;

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>
            {activeTab === 'available' ? 'Chargement des demandes...' : 'Chargement de vos demandes...'}
          </Text>
        </View>
      );
    }

    if (currentData.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>
            {activeTab === 'available' ? 'Aucune demande disponible' : 'Aucune demande créée'}
          </Text>
          <Text style={styles.emptyText}>
            {activeTab === 'available'
              ? "Il n'y a pour le moment aucune demande publiée par d'autres passagers."
              : "Vous n'avez pas encore publié de demande. Créez-en une pour recevoir des réponses de conducteurs."}
          </Text>
          {activeTab === 'my-requests' && (
            <TouchableOpacity
              style={styles.createRequestButton}
                onPress={() => router.push(getTripRequestCreateHref())}
            >
              <Ionicons name="add-circle" size={20} color={Colors.white} />
              <Text style={styles.createRequestButtonText}>Créer une demande</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <FlatList
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        data={currentData}
        keyExtractor={(item) => item.id}
        renderItem={activeTab === 'available' ? renderAvailableRequestCard : renderMyRequestCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Demandes de trajet</Text>
        {activeTab === 'my-requests' && (
          <TouchableOpacity
            style={styles.createButton}
                onPress={() => router.push(getTripRequestCreateHref())}
          >
            <Ionicons name="add-circle" size={24} color={Colors.primary} />
          </TouchableOpacity>
        )}
        {activeTab === 'available' && <View style={styles.headerSpacer} />}
      </View>

      {/* Onglets */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'available' && styles.tabActive]}
          onPress={() => setActiveTab('available')}
        >
          <Text style={[styles.tabCount, activeTab === 'available' && styles.tabCountActive]}>
            {requestsCount.available}
          </Text>
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            Disponibles
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'my-requests' && styles.tabActive]}
          onPress={() => setActiveTab('my-requests')}
        >
          <Text style={[styles.tabCount, activeTab === 'my-requests' && styles.tabCountActive]}>
            {requestsCount.my}
          </Text>
          <Text style={[styles.tabText, activeTab === 'my-requests' && styles.tabTextActive]}>
            Mes demandes
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contextCard}>
        <View style={styles.contextCardHeader}>
          <View style={styles.contextIconContainer}>
            <Ionicons
              name={activeTab === 'available' ? 'people-outline' : 'document-text-outline'}
              size={20}
              color={activeTab === 'available' ? Colors.info : Colors.primary}
            />
          </View>
          <View style={styles.contextBadge}>
            <Text style={styles.contextBadgeText}>{activeTabMeta.countLabel}</Text>
          </View>
        </View>
        <Text style={styles.contextEyebrow}>{activeTabMeta.eyebrow}</Text>
        <Text style={styles.contextTitle}>{activeTabMeta.title}</Text>
        <Text style={styles.contextDescription}>{activeTabMeta.description}</Text>
        {activeTab === 'my-requests' && (
          <TouchableOpacity
            style={styles.contextPrimaryButton}
            onPress={() => router.push(getTripRequestCreateHref())}
          >
            <Ionicons name="add-circle-outline" size={18} color={Colors.white} />
            <Text style={styles.contextPrimaryButtonText}>Créer une demande</Text>
          </TouchableOpacity>
        )}
      </View>

      {renderContent()}
    </SafeAreaView>
  );
}

