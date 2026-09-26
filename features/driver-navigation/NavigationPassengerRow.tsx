import React, { memo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { Waypoint } from './navigationModel';
import { passengerPanelLabels, type PassengerPanelItem } from './passengerPanelModel';
import { passengerPanelStyles as styles } from './NavigationPassengersModal.styles';

interface Props {
  item: PassengerPanelItem;
  onSelect: (waypoint: Waypoint) => void;
  onReport: (waypoint: Waypoint) => void;
}

export const NavigationPassengerRow = memo(function NavigationPassengerRow({ item, onSelect, onReport }: Props) {
  const labels = passengerPanelLabels(item);
  const canOpen = item.status !== 'droppedOff' && !item.waypoint.completed;
  return (
    <View style={[styles.row, item.isNext && styles.nextRow]}>
      {item.isNext ? <Text style={styles.nextLabel}>PROCHAIN ARRÊT</Text> : null}
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.status}>{labels.status} · {labels.seats}</Text>
      <Text style={styles.locationLabel}>{labels.location}</Text>
      <Text style={styles.address}>{item.waypoint.address || 'Adresse à confirmer avec le passager'}</Text>
      {canOpen ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.detailButton} onPress={() => onSelect(item.waypoint)}
            accessibilityRole="button" accessibilityLabel={`Voir le point d’arrêt de ${item.name}, ${labels.status}, ${labels.seats}`}>
            <Text style={styles.detailText}>Voir le point d’arrêt</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray[700]} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportButton} onPress={() => onReport(item.waypoint)}
            accessibilityRole="button" accessibilityLabel={`Signaler un problème avec ${item.name}`}>
            <Ionicons name="flag-outline" size={16} color={Colors.gray[600]} />
            <Text style={styles.reportText}>Signaler un problème</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
});
