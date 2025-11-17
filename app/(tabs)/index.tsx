import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectAvailableTrips, selectSavedLocations } from '@/store/selectors';
import { addSavedLocation } from '@/store/slices/locationSlice';
import { formatTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const trips = useAppSelector(selectAvailableTrips);
  const savedLocations = useAppSelector(selectSavedLocations);
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [addMode, setAddMode] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');

  const popularLocations = [
    { id: 'gombe', label: 'Gombe', address: 'Gombe, Kinshasa', coords: { latitude: -4.3206, longitude: 15.3115 } },
    { id: 'lemba', label: 'Lemba', address: 'Lemba, Kinshasa', coords: { latitude: -4.419, longitude: 15.317 } },
    { id: 'kintambo', label: 'Kintambo', address: 'Kintambo, Kinshasa', coords: { latitude: -4.334, longitude: 15.263 } },
    { id: 'ngaliema', label: 'Ngaliema', address: 'Ngaliema, Kinshasa', coords: { latitude: -4.347, longitude: 15.244 } },
    { id: 'bandal', label: 'Bandalungwa', address: 'Bandalungwa, Kinshasa', coords: { latitude: -4.375, longitude: 15.298 } },
    { id: 'kalamu', label: 'Kalamu', address: 'Kalamu, Kinshasa', coords: { latitude: -4.360, longitude: 15.305 } },
  ];

  const handleLocationPress = (location: { coords: { latitude: number; longitude: number }; label: string }) => {
    router.push({
      pathname: '/search',
      params: {
        origin: location.label,
        latitude: location.coords.latitude.toString(),
        longitude: location.coords.longitude.toString(),
      },
    });
  };

  const handleAddLocation = () => {
    if (!customLabel || !customAddress || !customLat || !customLng) return;
    const latitude = parseFloat(customLat);
    const longitude = parseFloat(customLng);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return;
    }

    dispatch(
      addSavedLocation({
        id: `${Date.now()}`,
        label: customLabel,
        address: customAddress,
        coords: { latitude, longitude },
      }),
    );

    setCustomLabel('');
    setCustomAddress('');
    setCustomLat('');
    setCustomLng('');
    setAddMode(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Bonjour 👋</Text>
            <Text style={styles.headerTitle}>Trouvez votre trajet</Text>
          </View>
          <TouchableOpacity style={styles.notificationButton}>
            <Ionicons name="notifications" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Recherche rapide */}
        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <Ionicons name="location" size={20} color={Colors.success} />
            <TextInput
              style={styles.searchInput}
              placeholder="Point de départ"
              placeholderTextColor={Colors.gray[500]}
              value={departure}
              onChangeText={setDeparture}
            />
          </View>
          <View style={styles.searchDivider} />
          <View style={styles.searchRow}>
            <Ionicons name="navigate" size={20} color={Colors.primary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Destination"
              placeholderTextColor={Colors.gray[500]}
              value={arrival}
              onChangeText={setArrival}
            />
          </View>
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={() => router.push('/search')}
          >
            <Text style={styles.searchButtonText}>Rechercher</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Lieux populaires */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Lieux populaires</Text>
            <TouchableOpacity onPress={() => setAddMode((prev) => !prev)}>
              <Text style={styles.seeAllText}>{addMode ? 'Annuler' : 'Ajouter'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.popularLocations}>
            {popularLocations.map((location) => (
              <TouchableOpacity
                key={location.id}
                style={styles.locationChip}
                onPress={() => handleLocationPress(location)}
                activeOpacity={0.85}
              >
                <Ionicons name="location" size={16} color={Colors.primary} />
                <Text style={styles.locationChipText}>{location.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {savedLocations.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedTitle}>Vos lieux favoris</Text>
              {savedLocations.map((location) => (
                <TouchableOpacity
                  key={location.id}
                  style={styles.locationCard}
                  onPress={() => handleLocationPress(location)}
                >
                  <View style={[styles.locationIcon, { backgroundColor: Colors.secondary + '15' }]}>
                    <Ionicons name="star" size={18} color={Colors.secondary} />
                  </View>
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationName}>{location.label}</Text>
                    <Text style={styles.locationAddress}>{location.address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {addMode && (
            <View style={styles.addLocationCard}>
              <Text style={styles.addLocationTitle}>Ajouter un lieu habituel</Text>
              <View style={styles.addInputRow}>
                <Ionicons name="bookmark" size={18} color={Colors.primary} />
                <TextInput
                  style={styles.addInput}
                  placeholder="Nom (Maison, Bureau...)"
                  placeholderTextColor={Colors.gray[500]}
                  value={customLabel}
                  onChangeText={setCustomLabel}
                />
              </View>
              <View style={styles.addInputRow}>
                <Ionicons name="location" size={18} color={Colors.primary} />
                <TextInput
                  style={styles.addInput}
                  placeholder="Adresse"
                  placeholderTextColor={Colors.gray[500]}
                  value={customAddress}
                  onChangeText={setCustomAddress}
                />
              </View>
              <View style={styles.coordsRow}>
                <View style={[styles.addInputRow, styles.coordInput]}>
                  <Ionicons name="navigate" size={18} color={Colors.primary} />
                  <TextInput
                    style={styles.addInput}
                    placeholder="Latitude"
                    placeholderTextColor={Colors.gray[500]}
                    keyboardType="numeric"
                    value={customLat}
                    onChangeText={setCustomLat}
                  />
                </View>
                <View style={[styles.addInputRow, styles.coordInput]}>
                  <Ionicons name="navigate" size={18} color={Colors.primary} />
                  <TextInput
                    style={styles.addInput}
                    placeholder="Longitude"
                    placeholderTextColor={Colors.gray[500]}
                    keyboardType="numeric"
                    value={customLng}
                    onChangeText={setCustomLng}
                  />
                </View>
              </View>
              <TouchableOpacity style={styles.addButton} onPress={handleAddLocation}>
                <Text style={styles.addButtonText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Actions rapides */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickActionCard, { marginRight: Spacing.md }]}
              onPress={() => router.push('/publish')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.primary }]}>
                <Ionicons name="add-circle" size={24} color={Colors.white} />
              </View>
              <Text style={styles.quickActionTitle}>Publier un trajet</Text>
              <Text style={styles.quickActionSubtitle}>En 3 clics</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionCard, styles.quickActionCardBlue]}
              onPress={() => router.push('/search')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.info }]}>
                <Ionicons name="search" size={24} color={Colors.white} />
              </View>
              <Text style={styles.quickActionTitle}>Chercher un trajet</Text>
              <Text style={styles.quickActionSubtitle}>Trouvez votre route</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Trajets disponibles */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trajets disponibles</Text>
            <TouchableOpacity onPress={() => router.push('/search')}>
              <Text style={styles.seeAllText}>Voir tout</Text>
            </TouchableOpacity>
          </View>

          {trips.slice(0, 3).map((trip, index) => (
            <Animated.View
              key={trip.id}
              entering={FadeInDown.delay(index * 100)}
              style={styles.tripCard}
            >
              <View style={styles.tripHeader}>
                <View style={styles.tripDriverInfo}>
                  <View style={styles.avatar} />
                  <View style={styles.tripDriverDetails}>
                    <Text style={styles.driverName}>{trip.driverName}</Text>
                    <View style={styles.driverMeta}>
                      <Ionicons name="star" size={14} color={Colors.secondary} />
                      <Text style={styles.driverRating}>{trip.driverRating}</Text>
                      <View style={styles.dot} />
                      <Text style={styles.vehicleInfo}>{trip.vehicleInfo}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.priceBadge}>
                  <Text style={styles.priceText}>{trip.price} FC</Text>
                </View>
              </View>

              <View style={styles.tripRoute}>
                <View style={styles.routeRow}>
                  <Ionicons name="location" size={16} color={Colors.success} />
                  <Text style={styles.routeText}>{trip.departure.name}</Text>
                  <Text style={styles.routeTime}>
                    {formatTime(trip.departureTime)}
                  </Text>
                </View>

                <View style={styles.routeRow}>
                  <Ionicons name="navigate" size={16} color={Colors.primary} />
                  <Text style={styles.routeText}>{trip.arrival.name}</Text>
                  <Text style={styles.routeTime}>
                    {formatTime(trip.arrivalTime)}
                  </Text>
                </View>
              </View>

              <View style={styles.tripFooter}>
                <View style={styles.tripFooterLeft}>
                  <Ionicons name="people" size={16} color={Colors.gray[600]} />
                  <Text style={styles.seatsText}>
                    {trip.availableSeats} places disponibles
                  </Text>
                </View>
                <TouchableOpacity style={styles.reserveButton}>
                  <Text style={styles.reserveButtonText}>Réserver</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}
        </View>
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
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  greeting: {
    color: Colors.white,
    opacity: 0.8,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  notificationButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowLg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  searchDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  searchButton: {
    backgroundColor: Colors.primary,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.md,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
  popularLocations: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  locationChipText: {
    marginLeft: Spacing.xs,
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: Spacing.sm,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  locationAddress: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  savedSection: {
    marginTop: Spacing.md,
  },
  savedTitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
  },
  addLocationCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    gap: Spacing.sm,
  },
  addLocationTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  addInput: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    paddingVertical: Spacing.sm,
  },
  coordsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  coordInput: {
    flex: 1,
  },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  addButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  quickActions: {
    flexDirection: 'row',
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.2)',
  },
  quickActionCardBlue: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderColor: 'rgba(52, 152, 219, 0.2)',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  quickActionTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  quickActionSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  tripDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  tripDriverDetails: {
    flex: 1,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  dot: {
    width: 4,
    height: 4,
    backgroundColor: Colors.gray[400],
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.sm,
  },
  vehicleInfo: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  priceBadge: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  priceText: {
    color: Colors.success,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  tripRoute: {
    marginBottom: Spacing.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  routeText: {
    color: Colors.gray[700],
    marginLeft: Spacing.sm,
    flex: 1,
    fontSize: FontSizes.base,
  },
  routeTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  tripFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  tripFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seatsText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  reserveButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  reserveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
});
