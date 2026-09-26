import type { Waypoint, PickupNotice, PickupBypassConfirmation, TripEndNotice } from './navigationModel';
import { Spacing } from '@/constants/styles';
import React, { useCallback, useMemo } from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { buildPassengerPanelItems, type PassengerPanelItem } from './passengerPanelModel';
import { NavigationPassengerRow } from './NavigationPassengerRow';
import { passengerPanelStyles as styles } from './NavigationPassengersModal.styles';

interface NavigationPassengersModalProps {
  passengersPanelVisible: boolean;
  backgroundDisclosureVisible: boolean;
  securityModalVisible: boolean;
  tripEndNotice: TripEndNotice | null;
  pickupNotice: PickupNotice | null;
  pickupBypassConfirmation: PickupBypassConfirmation | null;
  waypointModalVisible: boolean;
  setPassengersPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insets: EdgeInsets;
  passengerStats: { totalPassengers: number; pendingPickups: number; completedDropoffs: number; inVehicle: number };
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  waypointModalVisibleRef: React.RefObject<boolean>;
  setActiveWaypoint: React.Dispatch<React.SetStateAction<Waypoint | null>>;
  setWaypointModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  openReportForWaypoint: (waypoint: Waypoint) => void;
}

const itemKey = (item: PassengerPanelItem) => item.id;

export function NavigationPassengersModal({
  passengersPanelVisible, backgroundDisclosureVisible, securityModalVisible, tripEndNotice, pickupNotice,
  pickupBypassConfirmation, waypointModalVisible, setPassengersPanelVisible, insets, passengerStats,
  waypoints, currentWaypointIndex, waypointModalVisibleRef, setActiveWaypoint, setWaypointModalVisible,
  openReportForWaypoint,
}: NavigationPassengersModalProps) {
  const visible = passengersPanelVisible && !backgroundDisclosureVisible && !securityModalVisible
    && !tripEndNotice && !pickupNotice && !pickupBypassConfirmation && !waypointModalVisible;
  const items = useMemo(() => visible ? buildPassengerPanelItems(waypoints, currentWaypointIndex) : [],
    [visible, waypoints, currentWaypointIndex]);
  const close = useCallback(() => setPassengersPanelVisible(false), [setPassengersPanelVisible]);
  const selectWaypoint = useCallback((waypoint: Waypoint) => {
    if (waypoint.completed) return;
    waypointModalVisibleRef.current = true;
    setActiveWaypoint(waypoint);
    setPassengersPanelVisible(false);
    setWaypointModalVisible(true);
  }, [waypointModalVisibleRef, setActiveWaypoint, setPassengersPanelVisible, setWaypointModalVisible]);
  const reportWaypoint = useCallback((waypoint: Waypoint) => {
    if (waypoint.completed) return;
    // Release the panel before navigating to the existing report form.
    setPassengersPanelVisible(false);
    openReportForWaypoint(waypoint);
  }, [setPassengersPanelVisible, openReportForWaypoint]);
  const renderItem = useCallback(({ item }: { item: PassengerPanelItem }) => (
    <NavigationPassengerRow item={item} onSelect={selectWaypoint} onReport={reportWaypoint} />
  ), [selectWaypoint, reportWaypoint]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}
          accessible={false} importantForAccessibility="no" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md }]}>
          <View style={styles.handle} />
          <FlatList data={items} keyExtractor={itemKey} renderItem={renderItem}
            style={styles.list} contentContainerStyle={styles.listContent}
            initialNumToRender={8} maxToRenderPerBatch={8} windowSize={3} removeClippedSubviews={false}
            ListHeaderComponent={
              <View style={styles.header}>
                <Text style={styles.title} accessibilityRole="header">Mes passagers</Text>
                <Text style={styles.subtitle}>
                  {items.length} {items.length > 1 ? 'réservations' : 'réservation'} · {passengerStats.totalPassengers} {passengerStats.totalPassengers > 1 ? 'places' : 'place'}
                </Text>
                <View style={styles.summary}>
                  {[['À récupérer', passengerStats.pendingPickups], ['À bord', passengerStats.inVehicle], ['Déposés', passengerStats.completedDropoffs]].map(([label, count]) => (
                    <View key={label} style={styles.summaryItem} accessible accessibilityLabel={`${count} ${label}`}>
                      <Text style={styles.summaryValue}>{count}</Text>
                      <Text style={styles.summaryLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.hint}>L’embarquement et la dépose sont suivis automatiquement.</Text>
              </View>
            }
            ListEmptyComponent={<Text style={styles.empty}>Aucun passager à afficher pour le moment.</Text>}
          />
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeButton} onPress={close} accessibilityRole="button">
              <Text style={styles.closeText}>Revenir à la carte</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
