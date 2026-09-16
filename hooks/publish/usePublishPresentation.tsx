import { styles } from '../../features/screen-styles/app/publish/index';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

interface Params {
  departureAddress: string;
  departureLocation: MapLocationSelection | null;
  arrivalAddress: string;
  arrivalLocation: MapLocationSelection | null;
}

export function usePublishPresentation({
  departureAddress,
  departureLocation,
  arrivalAddress,
  arrivalLocation,
}: Params) {
  const renderGpsStatus = (
    hasAddress: boolean,
    hasGpsSuggestion: boolean,
    isConfirmed: boolean,
    label: string,
  ) => {
    if (!hasAddress && !hasGpsSuggestion) {
      return null;
    }

    const isReady = isConfirmed;
    const message = isReady
      ? `${label} confirmé sur la carte`
      : hasGpsSuggestion
        ? `${label} trouvé, vérifiez le point sur la carte`
        : `${label} à confirmer sur la carte`;

    return (
      <View style={styles.gpsStatus}>
        <Ionicons
          name={isReady ? 'checkmark-circle' : 'alert-circle'}
          size={14}
          color={isReady ? Colors.success : Colors.warning}
        />
        <Text style={[styles.gpsStatusText, isReady && styles.gpsStatusTextReady]}>
          {message}
        </Text>
      </View>
    );
  };
  const departureSummary = useMemo(
    () => ({
      title: departureAddress || 'Point de départ non défini',
      address: departureLocation?.address ?? departureAddress,
      latitude: departureLocation?.latitude,
      longitude: departureLocation?.longitude,
    }),
    [departureAddress, departureLocation?.address, departureLocation?.latitude, departureLocation?.longitude],
  );

  const arrivalSummary = useMemo(
    () => ({
      title: arrivalAddress || 'Destination non définie',
      address: arrivalLocation?.address ?? arrivalAddress,
      latitude: arrivalLocation?.latitude,
      longitude: arrivalLocation?.longitude,
    }),
    [arrivalAddress, arrivalLocation?.address, arrivalLocation?.latitude, arrivalLocation?.longitude],
  );
  const recurringWeekdayOptions = useMemo(
    () => [
      { value: 1, label: 'Lun' },
      { value: 2, label: 'Mar' },
      { value: 3, label: 'Mer' },
      { value: 4, label: 'Jeu' },
      { value: 5, label: 'Ven' },
      { value: 6, label: 'Sam' },
      { value: 7, label: 'Dim' },
    ],
    [],
  );

  const formatDateOnlyValue = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatTimeOnlyValue = (date: Date) => {
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const toIsoWeekday = (date: Date) => {
    const weekday = date.getDay();
    return weekday === 0 ? 7 : weekday;
  };

  return {
    recurringWeekdayOptions,
    toIsoWeekday,
    formatDateOnlyValue,
    formatTimeOnlyValue,
    renderGpsStatus,
    departureSummary,
    arrivalSummary,
  };
}
