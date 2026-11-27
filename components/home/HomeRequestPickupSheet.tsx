import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles as s } from '@/features/home/HomeRequestPickupSheet.styles';
import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import type { useHomeRequestPickup } from '@/hooks/home/useHomeRequestPickup';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomeContext } from '@/hooks/home/useHomeContext';

type Props = ReturnType<typeof useHomeRequestPickup>
  & Pick<ReturnType<typeof useHomeSheet>, 'sheetBottomOffset' | 'sheetHeight' | 'onSheetLayout'>
  & Pick<ReturnType<typeof useHomeMapNavigation>, 'openTripRequestDetail'>
  & Pick<ReturnType<typeof useHomeContext>, 'width'>;

/** Cannot be swiped away: the accepted pickup replaces discovery until boarding or cancellation. */
export const HomeRequestPickupSheet = React.memo(function HomeRequestPickupSheet({
  homeRequestPickup: request, pickupModel, pickupOnline, pickupLoading,
  sheetBottomOffset, sheetHeight, onSheetLayout, openTripRequestDetail, width,
}: Props) {
  if (!request) return null;
  const model = pickupOnline ? pickupModel : null;
  const vehicle = model?.vehicleDetails ?? request.selectedVehicle;
  const horizontal = width >= 600 && sheetHeight < 240;
  const driverName = model?.person.name || request.selectedDriverName || 'Votre conducteur';
  const initials = driverName.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
  const vehicleLabel = vehicle ? [vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' · ') : model?.vehicle;
  const pickup = model?.pickup.location || request.departure?.name || request.departure?.address || 'Voir la commande';
  const loading = pickupOnline && !model && pickupLoading;
  const estimate = model?.time ? `≈ ${model.time}${model.distance ? ` · ${model.distance}` : ''}` : null;
  const status = !pickupOnline ? 'Hors connexion' : estimate ?? (model?.status === 'paused' ? 'Trajet en pause'
    : loading ? 'Actualisation…' : model?.status === 'waiting_location' || (model?.status === 'estimated' && !model.driverPosition)
      ? 'Position en attente' : model?.driverPosition ? 'Estimation indisponible' : 'Position indisponible');
  const icon = !pickupOnline ? 'cloud-offline-outline' : estimate ? 'time-outline'
    : model?.status === 'paused' ? 'pause-circle-outline' : 'location-outline';
  return <View testID="home-request-pickup" onLayout={onSheetLayout}
    style={[s.sheet, horizontal && s.horizontalSheet, { bottom: sheetBottomOffset, height: sheetHeight }]}>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.confirmed}>
        <Ionicons name="checkmark-circle" size={20} color={c.green} accessible={false} />
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={s.confirmedText}>Conducteur confirmé</Text>
      </View>
      <View style={s.driver}>
        <View style={s.avatar} accessible={false}><Text maxFontSizeMultiplier={1.3} style={s.initials}>{initials}</Text></View>
        <View style={s.copy}>
          <Text style={s.name}>{driverName}</Text>
          {vehicleLabel ? <Text style={s.vehicle}>{vehicleLabel}</Text> : null}
          {vehicle?.licensePlate ? <View style={s.plate}><Text style={s.plateText}
            accessibilityLabel={`Plaque : ${vehicle.licensePlate}`}>{vehicle.licensePlate}</Text></View> : null}
        </View>
      </View>
      <View style={s.status}>
        {loading ? <ActivityIndicator size="small" color={c.muted} />
          : <Ionicons name={icon} size={22} color={estimate ? c.orange : c.muted} accessible={false} />}
        <View style={s.copy}>
          {estimate ? <Text style={s.label}>Temps de route estimé</Text> : null}
          <Text style={[s.statusText, !!estimate && s.estimate]} accessibilityLiveRegion="polite">{status}</Text>
        </View>
      </View>
      <View style={s.pickup}>
        <Ionicons name="location" size={22} color={c.green} accessible={false} />
        <View style={s.copy}>
          <Text style={s.label}>Rendez-vous</Text>
          <Text style={s.place}>{pickup}</Text>
          {model?.pickup.reference ? <Text style={s.vehicle}>{model.pickup.reference}</Text> : null}
        </View>
      </View>
    </ScrollView>
    <View style={[s.footer, horizontal && s.horizontalFooter]}><TouchableOpacity style={s.action} accessibilityRole="button"
      activeOpacity={0.8} accessibilityHint="Détails du conducteur et actions de votre commande."
      onPress={() => openTripRequestDetail(request.id)}>
      <Text style={s.actionText}>Voir ma commande</Text>
      <Ionicons name="arrow-forward" size={20} color="#FFFFFF" accessible={false} />
    </TouchableOpacity></View>
  </View>;
});
