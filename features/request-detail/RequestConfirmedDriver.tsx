import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Booking, TripRequest } from '@/types';
import { passengerRideStage } from '@/features/passenger-navigation/passengerRideProgress';
import { useConfirmedRequestPickup } from '@/hooks/request-detail/useConfirmedRequestPickup';
import { confirmedRequestStyles as s } from './confirmedRequestStyles';

export function RequestConfirmedDriver({ request, active, booking }: { request: TripRequest; active: boolean; booking?: Booking }) {
  const stage = booking ? passengerRideStage(booking) : 'waiting';
  const { pickup, enabled, loading } = useConfirmedRequestPickup(request, active && stage === 'waiting');
  const name = pickup?.person.name || request.selectedDriverName || 'Votre conducteur';
  const vehicle = pickup?.vehicleDetails ?? request.selectedVehicle;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
  const estimate = pickup?.time ? `≈ ${pickup.time}${pickup.distance ? ` · ${pickup.distance}` : ''}` : null;
  const status = stage === 'dropoff' ? 'Dépose confirmée' : stage === 'pickup' ? 'À bord · En route vers votre destination'
    : !enabled ? 'Hors connexion' : loading ? 'Actualisation…' : estimate
    ? `Approche estimée ${estimate}` : pickup?.status === 'paused' ? 'Trajet en pause'
      : pickup?.status === 'waiting_location' || (pickup?.status === 'estimated' && !pickup.driverPosition)
        ? 'Position en attente' : 'Estimation indisponible';
  return <View style={s.driver}>
    <View style={s.avatar} accessible={false}><Text style={s.initials} maxFontSizeMultiplier={1.3}>{initials}</Text></View>
    <View style={s.copy}>
      <Text style={s.driverName}>{name}</Text>
      {vehicle && <View style={s.vehicleLine}>
        <Text style={s.vehicle}>{[vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' · ')}</Text>
        {!!vehicle.licensePlate && <View style={s.plate}><Text style={s.plateText} accessibilityLabel={`Plaque : ${vehicle.licensePlate}`}>{vehicle.licensePlate}</Text></View>}
      </View>}
      <View style={s.statusLine}>
        {loading && stage === 'waiting' ? <ActivityIndicator size="small" color="#536071" />
          : <Ionicons name={stage !== 'waiting' ? 'checkmark-circle-outline' : estimate ? 'time-outline' : !enabled ? 'cloud-offline-outline' : 'location-outline'} size={16} color="#536071" accessible={false} />}
        <Text style={s.status} accessibilityLiveRegion="polite">{status}</Text>
      </View>
    </View>
  </View>;
}
