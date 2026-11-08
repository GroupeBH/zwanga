import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '@/features/home/HomeOngoingTripSheet.styles';
import { HOME_DASHBOARD_COLORS as colors } from '@/features/home/homeDashboardTheme';
import type { useHomeController } from '@/hooks/home/useHomeController';

type Props = Pick<ReturnType<typeof useHomeController>,
  'activeHomeTrip' | 'ongoingDriverTrip' | 'ongoingBookingId' | 'activeBookings'
  | 'router' | 'width' | 'sheetHeight' | 'sheetBottomOffset' | 'onSheetLayout'>;

/** Uses the existing, account-scoped participation selection; no additional reads. */
export const HomeOngoingTripSheet = React.memo(function HomeOngoingTripSheet({
  activeHomeTrip, ongoingDriverTrip, ongoingBookingId, activeBookings,
  router, width, sheetHeight, sheetBottomOffset, onSheetLayout,
}: Props) {
  if (!activeHomeTrip) return null;
  const isDriving = ongoingDriverTrip?.id === activeHomeTrip.id;
  const booking = !isDriving ? activeBookings.find(item =>
    item.id === ongoingBookingId && item.tripId === activeHomeTrip.id) : undefined;
  const departure = booking?.passengerOrigin?.trim()
    || activeHomeTrip.departure?.name?.trim() || activeHomeTrip.departure?.address?.trim();
  const destination = booking?.passengerDestination?.trim()
    || activeHomeTrip.arrival?.name?.trim() || activeHomeTrip.arrival?.address?.trim();
  const horizontal = width >= 600 && sheetHeight < 240;
  // Never turn a driver-capable passenger account into the driver of this ride.
  const route = isDriving ? `/trip/navigate/${activeHomeTrip.id}` as const
    : ongoingBookingId ? `/booking/navigate/${ongoingBookingId}` as const : '/(tabs)/trips';

  return (
    <View testID="home-ongoing-trip" onLayout={onSheetLayout}
      style={[styles.sheet, horizontal && styles.horizontalSheet, { bottom: sheetBottomOffset, height: sheetHeight }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, horizontal && styles.horizontalContent]}
        showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
        <View style={[styles.status, horizontal && styles.horizontalStatus]}>
          {!horizontal && <View style={styles.statusIcon} accessible={false}>
            <Ionicons name={isDriving ? 'car-sport-outline' : 'navigate-outline'} size={24}
              color="#FFFFFF" accessible={false} />
          </View>}
          <View style={[styles.statusCopy, horizontal && styles.horizontalStatusCopy]}>
            <Text accessibilityRole="header" style={styles.title}>Trajet en cours</Text>
            <Text style={styles.role}>{isDriving ? 'Vous conduisez' : 'Vous êtes passager'}</Text>
          </View>
        </View>
        <View style={[styles.itinerary, horizontal && styles.horizontalItinerary]}>
          <View style={styles.routeRow}>
            <View style={styles.routeTrack} accessible={false}>
              <View style={styles.departureMarker} />
              <View style={styles.routeLine} />
            </View>
            <View style={[styles.placeCopy, styles.departureCopy]}>
              <Text style={styles.placeLabel}>{isDriving ? 'Départ' : 'Votre départ'}</Text>
              <Text style={styles.placeName}>{departure || 'À retrouver dans le trajet'}</Text>
            </View>
          </View>
          <View style={styles.routeRow}>
            <View style={styles.routeTrack} accessible={false}>
              <Ionicons name="location-sharp" size={23} color={colors.orange} accessible={false} />
            </View>
            <View style={styles.placeCopy}>
              <Text style={styles.placeLabel}>{isDriving ? 'Arrivée' : 'Votre arrivée'}</Text>
              <Text style={styles.placeName}>{destination || 'À retrouver dans le trajet'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <View style={[styles.footer, horizontal && styles.horizontalFooter]}>
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} style={styles.action}
          accessibilityHint={route === '/(tabs)/trips'
            ? 'Retrouvez votre trajet dans Mes trajets.' : 'Ouvrir la navigation et les actions de votre trajet.'}
          onPress={() => router.push(route)}>
          <Ionicons name="navigate" size={20} color="#FFFFFF" accessible={false} />
          <Text style={styles.actionText}>{route === '/(tabs)/trips' ? 'Retrouver mon trajet' : 'Revenir au trajet'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});
