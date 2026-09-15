import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { Vehicle } from '@/types';

interface TripEditVehicleListProps {
  activeEditVehicles: Vehicle[];
  editVehicleId: string | null;
  setEditVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function TripEditVehicleList({
  activeEditVehicles,
  editVehicleId,
  setEditVehicleId,
}: TripEditVehicleListProps) {
  return (
    <View style={styles.editVehicleList}>
      {activeEditVehicles.map((vehicle) => {
        const selected = editVehicleId === vehicle.id;
        return (
          <TouchableOpacity
            key={vehicle.id}
            style={[styles.editVehicleOption, selected && styles.editVehicleOptionSelected]}
            onPress={() => setEditVehicleId(vehicle.id)}
          >
            <View style={styles.editVehicleCopy}>
              <Text style={styles.editVehicleName}>{vehicle.brand} {vehicle.model}</Text>
              <Text style={styles.editVehicleMeta}>
                {[vehicle.color, vehicle.licensePlate].filter(Boolean).join(' • ')}
              </Text>
            </View>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={selected ? Colors.primary : Colors.gray[300]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
