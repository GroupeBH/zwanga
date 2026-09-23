import { Waypoint, PickupNotice, PickupBypassConfirmation, TripEndNotice } from './navigationModel';
import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

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
  passengerStats: { totalPassengers: number; pendingPickups: number; pendingDropoffs: number; completedPickups: number; completedDropoffs: number; inVehicle: number; passengers: { name: string; pickedUp: boolean; droppedOff: boolean; id: string; }[]; };
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  waypointModalVisibleRef: React.RefObject<boolean>;
  setActiveWaypoint: React.Dispatch<React.SetStateAction<Waypoint | null>>;
  setWaypointModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  openReportForWaypoint: (waypoint: Waypoint) => void;
}

export function NavigationPassengersModal({
  passengersPanelVisible,
  backgroundDisclosureVisible,
  securityModalVisible,
  tripEndNotice,
  pickupNotice,
  pickupBypassConfirmation,
  waypointModalVisible,
  setPassengersPanelVisible,
  insets,
  passengerStats,
  waypoints,
  currentWaypointIndex,
  waypointModalVisibleRef,
  setActiveWaypoint,
  setWaypointModalVisible,
  openReportForWaypoint,
}: NavigationPassengersModalProps) {
  return (
    <Modal
      visible={
        passengersPanelVisible &&
        !backgroundDisclosureVisible &&
        !securityModalVisible &&
        !tripEndNotice &&
        !pickupNotice &&
        !pickupBypassConfirmation &&
        !waypointModalVisible
      }
      transparent
      animationType="slide"
      onRequestClose={() => setPassengersPanelVisible(false)}
    >
      <View style={styles.passengersPanelOverlay}>
        <TouchableOpacity 
          style={styles.passengersPanelBackdrop} 
          activeOpacity={1}
          onPress={() => setPassengersPanelVisible(false)}
        />
        <View style={[styles.passengersPanelContent, { height: '85%', maxHeight: '85%', paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md }]}>
          <View style={styles.passengersPanelHandle} />
          
          {/* Header */}
          <View style={styles.passengersPanelHeader}>
            <Text style={styles.passengersPanelTitle}>Passagers du trajet</Text>
            <View style={styles.passengersPanelStats}>
              <View style={styles.statBadge}>
                <Ionicons name="person-add" size={14} color={Colors.secondary} />
                <Text style={styles.statText}>{passengerStats.completedPickups}/{passengerStats.completedPickups + passengerStats.pendingPickups}</Text>
              </View>
              <View style={styles.statBadge}>
                <Ionicons name="car" size={14} color={Colors.primary} />
                <Text style={styles.statText}>{passengerStats.inVehicle}</Text>
              </View>
              <View style={styles.statBadge}>
                <Ionicons name="flag" size={14} color={Colors.success} />
                <Text style={styles.statText}>{passengerStats.completedDropoffs}/{passengerStats.completedDropoffs + passengerStats.pendingDropoffs}</Text>
              </View>
            </View>
          </View>

          {/* Liste des waypoints */}
          <FlatList data={waypoints} keyExtractor={waypoint => waypoint.id} extraData={currentWaypointIndex}
            style={{ flex: 1 }} contentContainerStyle={styles.waypointsList} initialNumToRender={8}
            maxToRenderPerBatch={8} windowSize={3} removeClippedSubviews={false}
            renderItem={({ item: waypoint, index }) => {
              const isNext = index === currentWaypointIndex && !waypoint.completed;
              return (
                <TouchableOpacity
                  key={waypoint.id}
                  style={[
                    styles.waypointListItem,
                    waypoint.completed && styles.waypointListItemCompleted,
                    isNext && styles.waypointListItemNext,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (!waypoint.completed) {
                      waypointModalVisibleRef.current = true;
                      setActiveWaypoint(waypoint);
                      setPassengersPanelVisible(false);
                      setWaypointModalVisible(true);
                    }
                  }}
                  disabled={waypoint.completed}
                >
                  <View style={[
                    styles.waypointListIcon,
                    { backgroundColor: waypoint.type === 'pickup' ? Colors.secondary : Colors.success },
                    waypoint.completed && styles.waypointListIconCompleted,
                  ]}>
                    {waypoint.completed ? (
                      <Ionicons name="checkmark" size={14} color={Colors.white} />
                    ) : (
                      <Ionicons 
                        name={waypoint.type === 'pickup' ? 'person-add' : 'flag'} 
                        size={14} 
                        color={Colors.white} 
                      />
                    )}
                  </View>
                  
                  <View style={styles.waypointListInfo}>
                    <Text style={[
                      styles.waypointListName,
                      waypoint.completed && styles.waypointListNameCompleted,
                    ]}>
                      {waypoint.passenger.name}
                    </Text>
                    <Text style={styles.waypointListType}>
                      {waypoint.type === 'pickup' ? 'Prise en charge' : 'Arrivée'} · {waypoint.booking.numberOfSeats} place(s)
                    </Text>
                    <Text style={styles.waypointListType} numberOfLines={2}>{waypoint.address}</Text>
                  </View>

                  {!waypoint.completed && (
                    <View style={styles.waypointListActions}>
                      <TouchableOpacity
                        style={[styles.waypointListAction, styles.waypointListReportAction]}
                        onPress={(event) => {
                          event.stopPropagation();
                          openReportForWaypoint(waypoint);
                        }}
                      >
                        <Ionicons name="warning-outline" size={16} color={Colors.white} />
                      </TouchableOpacity>
                      <View
                        style={[
                          styles.waypointListGpsStatus,
                          {
                            backgroundColor:
                              waypoint.type === 'pickup'
                                ? Colors.secondary + '15'
                                : Colors.success + '15',
                            borderColor:
                              waypoint.type === 'pickup'
                                ? Colors.secondary
                                : Colors.success,
                          }
                        ]}
                      >
                        <Ionicons
                          name="locate"
                          size={14}
                          color={waypoint.type === 'pickup' ? Colors.secondary : Colors.success}
                        />
                        <Text
                          style={[
                            styles.waypointListGpsStatusText,
                            { color: waypoint.type === 'pickup' ? Colors.secondary : Colors.success },
                          ]}
                        >
                          Auto
                        </Text>
                      </View>
                    </View>
                  )}

                  {isNext && (
                    <View style={styles.nextBadge}>
                      <Text style={styles.nextBadgeText}>SUIVANT</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }} />

          {/* Bouton fermer */}
          <TouchableOpacity
            style={styles.closePanelButton}
            onPress={() => setPassengersPanelVisible(false)}
          >
            <Text style={styles.closePanelButtonText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
