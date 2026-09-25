import { useSearchController } from '@/hooks/search/useSearchController';
import { SearchRequestResultCard } from '../components/search/SearchRequestResultCard';
import { SearchResultCard } from '../components/search/SearchResultCard';
import { styles } from '../features/screen-styles/app/search/index';
import { SearchResultsToolbar } from '@/components/search/SearchResultsToolbar';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, Image, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getInitials,
  MIN_SEARCH_SEATS,
  getSafeTripId,
  getSafeTripRequestId,
  SearchResultListItem,
  MAX_SEARCH_SEATS,
} from '@/features/search/searchModel';

function SearchResultSeparator() {
  return <View style={styles.resultSeparator} />;
}

export default function SearchScreen({ embedded = false, bottomOverlay = 0 }: {
  embedded?: boolean;
  bottomOverlay?: number;
} = {}) {
  const {
    router, firstName, avatarUri, openingTripId,
    openingRequestId, handleOpenTrip, handleOpenTripRequest, searchResultData,
    draftDeparture, draftArrival, setDraftDeparture, setDraftArrival,
    desiredSeats, updateDesiredSeats, searchMode, setSearchMode,
    sortMode, setSortMode, resultsCountLabel, isRefreshingResults,
    isLoadingResults, currentError, handleRetry, handleApplySearch,
    filteredTrips, filteredTripRequests, handleCreateTripRequest, isDriverAccount,
  } = useSearchController();
  const renderSearchResult = useCallback(
    ({ item }: { item: SearchResultListItem }) => {
      if (item.kind === 'trip') {
        return (
          <SearchResultCard
            trip={item.trip}
            disabled={openingTripId !== null || openingRequestId !== null}
            onPress={handleOpenTrip}
          />
        );
      }

      return (
        <SearchRequestResultCard
          request={item.request}
          disabled={openingTripId !== null || openingRequestId !== null}
          onPress={handleOpenTripRequest}
        />
      );
    },
    [handleOpenTrip, handleOpenTripRequest, openingRequestId, openingTripId],
  );

  return (
    <SafeAreaView style={styles.container} edges={embedded ? ['top', 'left', 'right'] : ['top']}>
      <View style={styles.header}>
        {!embedded && <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryDark} />
        </TouchableOpacity>}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {embedded ? 'Recherche' : `Bonjour, ${firstName}`}
        </Text>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.headerAvatar} resizeMode="cover" />
        ) : (
          <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
            <Text style={styles.headerAvatarText}>{getInitials(firstName)}</Text>
          </View>
        )}
      </View>

      <FlatList
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Spacing.xxl + bottomOverlay }]}
        scrollIndicatorInsets={{ bottom: bottomOverlay }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={searchResultData}
        renderItem={renderSearchResult}
        keyExtractor={(item) =>
          item.kind === 'trip'
            ? getSafeTripId(item.trip) ?? `trip-${item.trip.departureTime}-${item.trip.driverId}`
            : getSafeTripRequestId(item.request) ?? `request-${item.request.createdAt}-${item.request.passengerId}`
        }
        ItemSeparatorComponent={SearchResultSeparator}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <>
        <View style={styles.routeSummaryCard}>
          <View style={styles.routeSummaryPlaces}>
            <View style={styles.routeSummaryRow}>
              <View style={[styles.routeDot, styles.routeDotStart]} />
              <TextInput
                style={styles.routeInput}
                value={draftDeparture}
                onChangeText={setDraftDeparture}
                onSubmitEditing={handleApplySearch}
                placeholder="Point de départ"
                placeholderTextColor={Colors.gray[500]}
                returnKeyType="next"
                autoCorrect={false}
              />
              {draftDeparture.length > 0 && (
                <TouchableOpacity
                  style={styles.clearRouteButton}
                  onPress={() => setDraftDeparture('')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.gray[400]} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.routeInputDivider} />
            <View style={styles.routeSummaryRow}>
              <View style={[styles.routeDot, styles.routeDotEnd]} />
              <TextInput
                style={styles.routeInput}
                value={draftArrival}
                onChangeText={setDraftArrival}
                onSubmitEditing={handleApplySearch}
                placeholder="Destination"
                placeholderTextColor={Colors.gray[500]}
                returnKeyType="search"
                autoCorrect={false}
              />
              {draftArrival.length > 0 && (
                <TouchableOpacity
                  style={styles.clearRouteButton}
                  onPress={() => setDraftArrival('')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.gray[400]} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.passengerBlock}>
            <View style={styles.passengerCountBlock}>
              <Text style={styles.passengerCount}>{desiredSeats}</Text>
              <Text style={styles.passengerLabel}>PERS.</Text>
            </View>
            <View style={styles.passengerStepper}>
              <TouchableOpacity
                style={[styles.passengerStepButton, desiredSeats <= MIN_SEARCH_SEATS && styles.passengerStepButtonDisabled]}
                onPress={() => updateDesiredSeats(desiredSeats - 1)}
                accessibilityRole="button"
                accessibilityLabel="Diminuer le nombre de places"
                disabled={desiredSeats <= MIN_SEARCH_SEATS}
                activeOpacity={0.75}
              >
                <Ionicons name="remove" size={16} color={desiredSeats <= MIN_SEARCH_SEATS ? Colors.gray[400] : Colors.primaryDark} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.passengerStepButton, desiredSeats >= MAX_SEARCH_SEATS && styles.passengerStepButtonDisabled]}
                onPress={() => updateDesiredSeats(desiredSeats + 1)}
                accessibilityRole="button"
                accessibilityLabel="Augmenter le nombre de places"
                disabled={desiredSeats >= MAX_SEARCH_SEATS}
                activeOpacity={0.75}
              >
                <Ionicons name="add" size={16} color={desiredSeats >= MAX_SEARCH_SEATS ? Colors.gray[400] : Colors.primaryDark} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.searchModeSegment}>
          <TouchableOpacity
            style={[styles.searchModeButton, searchMode === 'trips' && styles.searchModeButtonActive]}
            onPress={() => setSearchMode('trips')}
            activeOpacity={0.82}
          >
            <Ionicons
              name="car-sport-outline"
              size={16}
              color={searchMode === 'trips' ? Colors.white : Colors.gray[700]}
            />
            <Text style={[styles.searchModeButtonText, searchMode === 'trips' && styles.searchModeButtonTextActive]}>
              Trajets
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.searchModeButton, searchMode === 'requests' && styles.searchModeButtonActive]}
            onPress={() => setSearchMode('requests')}
            activeOpacity={0.82}
          >
            <Ionicons
              name="paper-plane-outline"
              size={16}
              color={searchMode === 'requests' ? Colors.white : Colors.gray[700]}
            />
            <Text style={[styles.searchModeButtonText, searchMode === 'requests' && styles.searchModeButtonTextActive]}>
              Demandes
            </Text>
          </TouchableOpacity>
        </View>

        <SearchResultsToolbar
          searchMode={searchMode}
          sortMode={sortMode}
          resultsCountLabel={resultsCountLabel}
          isRefreshingResults={isRefreshingResults}
          onSortChange={setSortMode}
        />

        {isLoadingResults && (
          <View style={styles.loaderCard}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loaderTitle}>
              {searchMode === 'requests' ? 'Recherche des demandes' : 'Recherche des trajets'}
            </Text>
            <Text style={styles.loaderText}>
              {searchMode === 'requests'
                ? 'On charge les demandes publiées par les passagers.'
                : 'On prépare les meilleures offres disponibles.'}
            </Text>
          </View>
        )}

        {currentError && !isLoadingResults && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
            <Text style={styles.errorText}>{currentError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoadingResults && !currentError && searchMode === 'trips' && filteredTrips.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="trail-sign-outline" size={30} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Aucun trajet trouvé</Text>
            <Text style={styles.emptyText}>
              Demandez ce trajet et les conducteurs disponibles pourront vous proposer une course.
            </Text>
            <TouchableOpacity style={styles.emptyActionButton} onPress={handleCreateTripRequest} activeOpacity={0.86}>
              <Ionicons name="paper-plane-outline" size={18} color={Colors.white} />
              <Text style={styles.emptyActionText}>Demander ce trajet</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoadingResults && !currentError && searchMode === 'requests' && filteredTripRequests.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="paper-plane-outline" size={30} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              {isDriverAccount ? 'Aucune demande trouvée' : 'Mode conducteur requis'}
            </Text>
            <Text style={styles.emptyText}>
              {isDriverAccount
                ? 'Aucune demande disponible ne correspond à cette recherche pour le moment.'
                : 'Les demandes disponibles sont visibles par les comptes conducteur.'}
            </Text>
          </View>
        )}

          </>
        }
      />
    </SafeAreaView>
  );
}
