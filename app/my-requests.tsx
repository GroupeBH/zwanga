import { styles } from '../features/screen-styles/app/my-requests/index';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { Colors } from '@/constants/styles';
import { useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import type { TripRequest } from '@/types';
import { RequestListCard } from '@/features/requests/RequestListCard';
import { getTripRequestCreateHref, getTripRequestDetailHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyTripRequestsScreen() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const {
    data: tripRequests = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetMyTripRequestsQuery(undefined, {
    // Polling léger pour mes demandes de trajet
    pollingInterval: isScreenActive ? (60_000) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const handleRequestPress = useCallback((requestId: string) => {
    router.push(getTripRequestDetailHref(requestId));
  }, [router]);

  const getRequestPriority = (request: TripRequest) => {
    if (request.status === 'driver_selected' && !request.tripId) return 0;
    if (request.status === 'offers_received') return 1;
    if (request.status === 'pending') return 2;
    if (request.status === 'cancelled') return 4;
    if (request.status === 'expired') return 5;
    return 3;
  };

  const sortedTripRequests = useMemo(() => {
    return [...tripRequests].sort((a, b) => {
      const priorityA = getRequestPriority(a);
      const priorityB = getRequestPriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const updatedA = new Date(a.updatedAt || a.createdAt).getTime();
      const updatedB = new Date(b.updatedAt || b.createdAt).getTime();
      return updatedB - updatedA;
    });
  }, [tripRequests]);

  const featuredRequestId = useMemo(() => {
    return (
      sortedTripRequests.find(
        (request) =>
          (request.status === 'pending' ||
            request.status === 'offers_received' ||
            request.status === 'driver_selected') &&
          !request.tripId,
      )?.id ?? null
    );
  }, [sortedTripRequests]);

  const renderTripRequestCard = useCallback(({ item }: { item: TripRequest }) => (
    <RequestListCard request={item} onOpen={handleRequestPress} own featured={item.id === featuredRequestId} />
  ), [featuredRequestId, handleRequestPress]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mes demandes</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Chargement de vos demandes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes demandes</Text>
        <TouchableOpacity
          style={styles.createButton}
              onPress={() => router.push(getTripRequestCreateHref())}
        >
          <Ionicons name="add-circle" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {sortedTripRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Aucune demande</Text>
          <Text style={styles.emptyText}>
            Vous n&apos;avez pas encore créé de demande de trajet. Créez-en une pour que les conducteurs vous proposent leurs services.
          </Text>
          <TouchableOpacity
            style={styles.createRequestButton}
              onPress={() => router.push(getTripRequestCreateHref())}
          >
            <Ionicons name="add-circle" size={20} color={Colors.white} />
            <Text style={styles.createRequestButtonText}>Créer une demande</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          data={sortedTripRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderTripRequestCard}
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
      )}
    </SafeAreaView>
  );
}
