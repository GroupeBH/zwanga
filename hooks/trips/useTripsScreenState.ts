import { MainTab, SubTab, EditTripStep } from '../../features/trips/tripsModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import {
  useDeleteTripMutation,
  useGetMyRecurringTripsQuery,
  useGetMyTripsQuery,
  useUpdateTripMutation,
} from '@/store/api/tripApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import type { Trip } from '@/types';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



export function useTripsScreenState() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [mainTab, setMainTab] = useState<MainTab>('published');
  const [subTab, setSubTab] = useState<SubTab>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const {
    data: myTrips,
    isLoading: tripsLoading,
    isFetching: tripsFetching,
    isError: tripsError,
    refetch: refetchTrips,
  } = useGetMyTripsQuery(undefined, {
    pollingInterval: isFocused ? 60000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });
  const {
    data: myBookings,
    isLoading: bookingsLoading,
    isFetching: bookingsFetching,
    isError: bookingsError,
    refetch: refetchBookings,
  } = useGetMyBookingsQuery(undefined, {
    pollingInterval: isFocused ? 60000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: isFocused,
    refetchOnReconnect: false,
  });
  const { data: recurringTemplates = [] } = useGetMyRecurringTripsQuery();
  const { data: userVehicles = [], isLoading: vehiclesLoading } = useGetVehiclesQuery();
  const activeUserVehicles = useMemo(
    () => userVehicles.filter((vehicle) => vehicle.isActive !== false),
    [userVehicles],
  );
  const [updateTripMutation, { isLoading: isSavingTrip }] = useUpdateTripMutation();
  const [deleteTripMutation, { isLoading: isDeletingTrip }] = useDeleteTripMutation();
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [editStep, setEditStep] = useState<EditTripStep>(1);
  const [editSeats, setEditSeats] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDateTime, setEditDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [editRouteMode, setEditRouteMode] = useState<'map' | 'manual'>('map');
  const [editDepartureSelection, setEditDepartureSelection] = useState<MapLocationSelection | null>(null);
  const [editArrivalSelection, setEditArrivalSelection] = useState<MapLocationSelection | null>(null);
  const [editDepartureManualAddress, setEditDepartureManualAddress] = useState('');
  const [editArrivalManualAddress, setEditArrivalManualAddress] = useState('');
  const [editRoutePickerTarget, setEditRoutePickerTarget] = useState<'departure' | 'arrival' | null>(null);
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const [editModalSuspended, setEditModalSuspended] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );
  const { shouldShow: shouldShowTripsGuide, complete: completeTripsGuide } =
    useTutorialGuide('trips_screen');
  const [tripsGuideVisible, setTripsGuideVisible] = useState(false);

  return {
    shouldShowTripsGuide,
    setTripsGuideVisible,
    completeTripsGuide,
    myTrips,
    recurringTemplates,
    setIsRefreshing,
    refetchTrips,
    refetchBookings,
    myBookings,
    subTab,
    searchQuery,
    mainTab,
    tripsLoading,
    bookingsLoading,
    tripsError,
    bookingsError,
    tripsFetching,
    bookingsFetching,
    editDateTime,
    setEditDateTime,
    setIosPickerMode,
    iosPickerMode,
    setFeedback,
    setEditingTrip,
    setEditSeats,
    setEditPrice,
    setEditDepartureSelection,
    setEditArrivalSelection,
    setEditDepartureManualAddress,
    setEditArrivalManualAddress,
    setEditRouteMode,
    setEditRoutePickerTarget,
    setEditVehicleId,
    setEditStep,
    setEditModalSuspended,
    editArrivalSelection,
    editDepartureSelection,
    editArrivalManualAddress,
    editDepartureManualAddress,
    editRouteMode,
    setDeleteTarget,
    insets,
    editingTrip,
    editVehicleId,
    editSeats,
    editPrice,
    updateTripMutation,
    deleteTarget,
    deleteTripMutation,
    router,
    setMainTab,
    setSubTab,
    setSearchQuery,
    feedback,
    isRefreshing,
    editModalSuspended,
    editStep,
    vehiclesLoading,
    activeUserVehicles,
    isSavingTrip,
    editRoutePickerTarget,
    isDeletingTrip,
    tripsGuideVisible,
  };
}
