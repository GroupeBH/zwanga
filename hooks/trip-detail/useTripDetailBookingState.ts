import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import {
  useCancelBookingMutation,
  useCreateBookingMutation,
  useInitiateBookingPaymentMutation,
} from '@/store/api/bookingApi';
import { useCreateConversationMutation, useLazyListConversationsQuery } from '@/store/api/messageApi';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import { useGetKycStatusQuery } from '@/store/api/userApi';
import type { TripPaymentMode } from '@/types';
import { type RouteInfo } from '@/utils/routeApi';
import { useEffect, useRef, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';
import type { Trip } from '@/types';

interface Params {
  trip: Trip | undefined;
  isFocused: boolean;
  tripId: string;
}

export function useTripDetailBookingState({
  trip,
  isFocused,
  tripId,
}: Params) {
  const [createBooking, { isLoading: isBooking }] = useCreateBookingMutation();
  const [initiateBookingPayment, { isLoading: isInitiatingBookingPayment }] =
    useInitiateBookingPaymentMutation();
  const [cancelBookingMutation, { isLoading: isCancellingBooking }] = useCancelBookingMutation();
  const [createConversation, { isLoading: isCreatingConversation }] = useCreateConversationMutation();
  const [loadConversations, { isFetching: isLookingUpConversation }] = useLazyListConversationsQuery();
  const isOpeningConversation = isCreatingConversation || isLookingUpConversation;
  const [createTripShareLink, { isLoading: isCreatingTripShareLink }] = useCreateTripShareLinkMutation();
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1); // 1: places, 2: points, 3: preview
  const [bookingSeats, setBookingSeats] = useState('1');
  const [bookingPaymentMode, setBookingPaymentMode] =
    useState<TripPaymentMode>('cash');
  const [bookingModalError, setBookingModalError] = useState('');
  const [passengerOrigin, setPassengerOrigin] = useState<MapLocationSelection | null>(null);
  const [passengerOriginManualAddress, setPassengerOriginManualAddress] = useState('');
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [passengerDestination, setPassengerDestination] = useState<MapLocationSelection | null>(null);
  const [passengerDestinationManualAddress, setPassengerDestinationManualAddress] = useState('');
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [shouldAutofillPassengerOrigin, setShouldAutofillPassengerOrigin] = useState(false);
  const [isValidatingDestination, setIsValidatingDestination] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{ visible: boolean; seats: number }>({
    visible: false,
    seats: 0,
  });
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [isDetailMapReady, setIsDetailMapReady] = useState(false);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [selectedReviewUserId, setSelectedReviewUserId] = useState<string | null>(null);
  const [selectedReviewUserName, setSelectedReviewUserName] = useState<string | null>(null);
  const { shouldShow: shouldShowTripGuide, complete: completeTripGuide } =
    useTutorialGuide('trip_detail_screen');
  const [tripGuideVisible, setTripGuideVisible] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }> | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState<Date | null>(null);
  const [calculatedArrivalTime, setCalculatedArrivalTime] = useState<Date | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [vehicleDetailModalVisible, setVehicleDetailModalVisible] = useState(false);
  const securityModalTransitionRef = useRef(false);
  const securityModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sosModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refetch: refetchKycStatus } = useGetKycStatusQuery();
  const { data: driverReviews } = useGetReviewsQuery(trip?.driverId ?? '', {
    skip: !trip?.driverId,
  });
  const { data: driverAverageData } = useGetAverageRatingQuery(trip?.driverId ?? '', {
    skip: !trip?.driverId,
  });

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setIsDetailMapReady(false);
      setMapModalVisible(false);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      // Give the previous screen's native map one frame to detach after the
      // navigation animation. Mounting both maps together can terminate iOS.
      timeoutId = setTimeout(() => {
        if (!cancelled) setIsDetailMapReady(true);
      }, Platform.OS === 'ios' ? 420 : 120);
    });

    return () => {
      cancelled = true;
      interactionTask.cancel();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isFocused, tripId]);

  useEffect(() => () => {
    if (securityModalTimerRef.current) clearTimeout(securityModalTimerRef.current);
    if (sosModalTimerRef.current) clearTimeout(sosModalTimerRef.current);
  }, []);

  return {
    setRefreshing,
    refetchKycStatus,
    driverReviews,
    driverAverageData,
    shouldShowTripGuide,
    setTripGuideVisible,
    completeTripGuide,
    setBookingModalVisible,
    passengerOrigin,
    passengerOriginManualAddress,
    passengerDestination,
    passengerDestinationManualAddress,
    setBookingSeats,
    setBookingPaymentMode,
    setBookingModalError,
    setPassengerOrigin,
    setPassengerOriginManualAddress,
    setPassengerDestination,
    setPassengerDestinationManualAddress,
    setShouldAutofillPassengerOrigin,
    setBookingStep,
    sosModalTimerRef,
    setIsDetailMapReady,
    setSosModalVisible,
    securityModalVisible,
    securityModalTransitionRef,
    securityModalTimerRef,
    setSecurityModalVisible,
    isBooking,
    setShowOriginPicker,
    setShowDestinationPicker,
    bookingModalVisible,
    shouldAutofillPassengerOrigin,
    bookingStep,
    bookingSeats,
    setBookingSuccess,
    loadConversations,
    createConversation,
    isCreatingTripShareLink,
    createTripShareLink,
    initiateBookingPayment,
    isInitiatingBookingPayment,
    isValidatingDestination,
    setIsValidatingDestination,
    routeCoordinates,
    createBooking,
    bookingPaymentMode,
    cancelBookingMutation,
    setRouteCoordinates,
    setRouteInfo,
    setCalculatedArrivalTime,
    setIsLoadingRoute,
    routeInfo,
    setEstimatedArrivalTime,
    isDetailMapReady,
    calculatedArrivalTime,
    refreshing,
    mapModalVisible,
    setMapModalVisible,
    estimatedArrivalTime,
    setVehicleDetailModalVisible,
    isOpeningConversation,
    setContactModalVisible,
    setSelectedImageUri,
    setImageModalVisible,
    isCancellingBooking,
    vehicleDetailModalVisible,
    sosModalVisible,
    bookingModalError,
    showOriginPicker,
    showDestinationPicker,
    bookingSuccess,
    reviewsModalVisible,
    setReviewsModalVisible,
    tripGuideVisible,
    imageModalVisible,
    selectedImageUri,
    contactModalVisible,
  };
}
