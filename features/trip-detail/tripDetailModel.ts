import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { ELECTRONIC_PAYMENTS_ENABLED } from '@/constants/paymentFeatures';
import { Colors } from '@/constants/styles';
import { type BookingAutoProgressPayload } from '@/services/trackingSocket';
import type { BookingStatus, Conversation, GeoPoint, TripPaymentMode } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { Ionicons } from '@expo/vector-icons';
import { Platform, type ImageRequireSource } from 'react-native';
import { PROVIDER_GOOGLE } from 'react-native-maps';

export const pointToLatLng = (point?: GeoPoint | null) => {
  if (!point?.coordinates || point.coordinates.length < 2) {
    return null;
  }
  const [longitudeValue, latitudeValue] = point.coordinates;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    latitude,
    longitude,
  };
};

export const arrayToLatLng = (coordinates?: [number, number] | null) => {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }
  const [longitudeValue, latitudeValue] = coordinates;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    latitude,
    longitude,
  };
};

export const USE_CUSTOM_MAP_MARKERS = false;
export const USE_ANDROID_MAP_MARKER_IMAGES = Platform.OS === 'android';
export const TRIP_DETAIL_MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
export const TRIP_DETAIL_MAP_MIN_DELTA = 0.006;
export const TRIP_DETAIL_MAP_MAX_DELTA = 0.014;
export const TRIP_DETAIL_MAP_PADDING = 1.02;
export const LOCATION_PICKER_OPEN_DELAY_MS = Platform.OS === 'ios' ? 250 : 0;
export const ANDROID_TRIP_DETAIL_MARKER_ANCHOR = { x: 0.5, y: 0.86 };
export const androidTripDetailMarkerImages: Record<'departure' | 'arrival' | 'passenger', ImageRequireSource> = {
  departure: require('@/assets/images/map-markers/trip-detail-marker-departure.png'),
  arrival: require('@/assets/images/map-markers/trip-detail-marker-arrival.png'),
  passenger: require('@/assets/images/map-markers/trip-detail-marker-passenger.png'),
};
export const DEFAULT_MAP_REGION = {
  latitude: -4.325,
  longitude: 15.322,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};
export const TRIP_PAYMENT_MODE_OPTIONS: {
  id: TripPaymentMode;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  selection: 'checkbox' | 'radio';
}[] = [
  ...(ELECTRONIC_PAYMENTS_ENABLED
    ? [
        {
          id: 'electronic' as const,
          label: 'Paiement electronique',
          description: "Régler par Mobile Money uniquement après l'arrivée",
          icon: 'card-outline' as const,
          selection: 'checkbox' as const,
        },
      ]
    : []),
  {
    id: 'points',
    label: 'Jetons Zwanga',
    description: "Debiter vos jetons uniquement après l'arrivée",
    icon: 'wallet-outline',
    selection: 'radio',
  },
  {
    id: 'cash',
    label: "Paiement à l'arrivée",
    description: 'Réglez directement auprès du conducteur',
    icon: 'cash-outline',
    selection: 'radio',
  },
];
export const getTripPaymentModeLabel = (mode?: TripPaymentMode | null) =>
  TRIP_PAYMENT_MODE_OPTIONS.find((option) => option.id === mode)?.label ??
  "Paiement à l'arrivée";
export const getTripPaymentSelectionIcon = (
  option: (typeof TRIP_PAYMENT_MODE_OPTIONS)[number],
  selected: boolean,
): keyof typeof Ionicons.glyphMap => {
  if (option.selection === 'checkbox') {
    return selected ? 'checkbox' : 'square-outline';
  }

  return selected ? 'radio-button-on' : 'radio-button-off';
};
export const DRC_PAYMENT_PHONE_REGEX = /^\+243\d{9}$/;
export type TripDetailAutoProgressEvent = BookingAutoProgressPayload['events'][number];
export const TRIP_DETAIL_AUTO_PROGRESS_PRIORITY: Record<TripDetailAutoProgressEvent['type'], number> = {
  driver_near_pickup: 0,
  driver_arrived_pickup: 1,
  parties_nearby: 2,
  passenger_ready_pickup: 3,
  pickup_confirmed: 4,
  passenger_no_show: 5,
  passenger_boarding_uncertain: 6,
  passenger_near_destination: 7,
  dropoff_confirmed: 8,
  driver_near_destination: 9,
  driver_arrived_destination: 10,
};
export const formatTripPaymentPhone = (value?: string | null) => {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('243')) return `+${digits}`;
  if (digits.startsWith('0')) return `+243${digits.slice(1)}`;
  return `+243${digits}`;
};

export const getConversationSortTime = (conversation: Conversation) => {
  const rawValue = conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt;
  const timestamp = rawValue ? new Date(rawValue).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const findDirectConversationWithUser = (
  conversations: Conversation[] | undefined,
  currentUserId: string,
  otherUserId: string,
) => {
  const matches = (conversations ?? [])
    .filter((conversation) => {
      const participantIds = new Set(
        conversation.participants
          ?.map((participant) => participant.userId)
          .filter(Boolean),
      );

      return (
        participantIds.size === 2 &&
        participantIds.has(currentUserId) &&
        participantIds.has(otherUserId)
      );
    })
    .sort((a, b) => getConversationSortTime(b) - getConversationSortTime(a));

  return matches.find((conversation) => !conversation.bookingId) ?? matches[0] ?? null;
};

export const isValidMapCoordinate = (coordinate?: { latitude: number; longitude: number } | null) =>
  Boolean(coordinate && normalizeTripMapCoordinate(coordinate.latitude, coordinate.longitude));

export const getLocationText = (selection: MapLocationSelection | null, manualAddress: string) =>
  (manualAddress.trim() || selection?.title || selection?.address || '').trim();

export const getLocationCoordinatesObject = (selection: MapLocationSelection | null) => {
  const coordinate = selection
    ? normalizeTripMapCoordinate(selection.latitude, selection.longitude)
    : null;
  if (!coordinate) {
    return undefined;
  }
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
};

export type EditTripStep = 1 | 2;

export const getLocationCoordinatesTuple = (
  selection: MapLocationSelection | null,
): [number, number] | undefined => {
  const coordinate = selection
    ? normalizeTripMapCoordinate(selection.latitude, selection.longitude)
    : null;
  if (!coordinate) {
    return undefined;
  }
  return [coordinate.longitude, coordinate.latitude];
};

export const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; background: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.secondary,
    background: 'rgba(247, 184, 1, 0.2)',
  },
  accepted: {
    label: 'Confirmée',
    color: Colors.success,
    background: 'rgba(46, 204, 113, 0.18)',
  },
  rejected: {
    label: 'Refusée',
    color: Colors.danger,
    background: 'rgba(239, 68, 68, 0.16)',
  },
  cancelled: {
    label: 'Annulée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
  no_show: {
    label: 'Non embarqué',
    color: Colors.danger,
    background: 'rgba(239, 68, 68, 0.12)',
  },
  boarding_uncertain: {
    label: 'Embarquement non confirmé',
    color: Colors.warning,
    background: 'rgba(245, 158, 11, 0.14)',
  },
  completed: {
    label: 'Terminée',
    color: Colors.gray[600],
    background: 'rgba(107, 114, 128, 0.18)',
  },
  expired: {
    label: '',
    color: '',
    background: ''
  }
};
