import {
  formatSubscriptionAmount,
  formatSubscriptionEndDate,
  getMostRecentPendingSubscriptionPayment
} from '@/features/profile/profileModel';
import { useGetMyDriverSettlementQuery } from '@/store/api/driverSettlementsApi';
import { useGetPendingSubscriptionPaymentsQuery } from '@/store/api/paymentApi';
import { useGetMyReferralSummaryQuery } from '@/store/api/referralApi';
import { useGetAverageRatingQuery, useGetReviewPageQuery } from '@/store/api/reviewApi';
import {
  useGetPremiumOverviewQuery,
  useGetSubscriptionPlansQuery
} from '@/store/api/subscriptionApi';
import { useGetMyDriverOffersQuery, useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import {
  useGetProfileSummaryQuery
} from '@/store/api/userApi';
import {
  useGetVehiclesQuery
} from '@/store/api/vehicleApi';
import { useAppSelector } from '@/store/hooks';
import { getProfileStatus } from '@/features/profile/profileStatusModel';
import { selectUser } from '@/store/selectors';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { screenReadOptions } from '@/features/performance/screenReadPolicy';
import { useProfileRefresh } from './useProfileRefresh';
import type {
  Vehicle, TripRequest, DriverOfferWithTripRequest, SubscriptionPlanSummary
} from '@/types';
import { useMemo, useState } from 'react';

const EMPTY_VEHICLES: Vehicle[] = [];
const EMPTY_REQUESTS: TripRequest[] = [];
const EMPTY_OFFERS: DriverOfferWithTripRequest[] = [];
const EMPTY_PLANS: SubscriptionPlanSummary[] = [];

export function useProfileData() {
  const user = useAppSelector(selectUser);
  const isScreenActive = useScreenIsActive();
  const reads = screenReadOptions(isScreenActive && Boolean(user?.id));
  const { refetchProfile, refetchKycStatus, refetchVehicles, refetchReferralSummary, refetchDriverSettlement } = useProfileRefresh();

  const [refreshing, setRefreshing] = useState(false);

  const { data: profileSummary, isLoading: profileLoading, isFetching: profileFetching,
    isError: hasProfileLoadError } = useGetProfileSummaryQuery(undefined, reads);

  const { data: referralSummary } = useGetMyReferralSummaryQuery(undefined, reads);

  const {
    data: vehicles,
    isLoading: vehiclesLoading,
    isFetching: vehiclesFetching,
    isError: vehiclesLoadError,
  } = useGetVehiclesQuery(undefined, reads);

  const { data: myTripRequests = EMPTY_REQUESTS } = useGetMyTripRequestsQuery(undefined, reads);

  const { data: myDriverOffers = EMPTY_OFFERS } = useGetMyDriverOffersQuery(undefined, reads);

  const status = getProfileStatus(profileSummary, user?.id);
  const { currentUser, stats, isDriver, displaysDriverRole, kycStatus,
    isKycApproved, isKycPending, isKycRejected, needsDriverOnboarding,
    isProfileStatusKnown, isIdentityStatusKnown, profileVehicleCount, profileState, profileRoleLabel } = status;
  const isProfileStatusAvailable = Boolean(profileState);
  const kycLoading = !isIdentityStatusKnown && profileFetching;

  const vehicleList: Vehicle[] = vehicles ?? EMPTY_VEHICLES;

  const { data: subscriptionPlans = EMPTY_PLANS } = useGetSubscriptionPlansQuery(undefined, reads);

  // Keep payment dependencies live: an operator/browser return can settle an
  // existing subscription while this tab is hidden. These queries do not poll.
  const {
    data: premiumOverview,
    isFetching: premiumOverviewFetching,
    refetch: refetchPremiumOverview,
  } = useGetPremiumOverviewQuery(undefined, { skip: !isDriver });

  const { data: paymentHistory, refetch: refetchPaymentHistory } = useGetPendingSubscriptionPaymentsQuery(undefined, {
    skip: !isDriver,
  });

  const { data: driverSettlement } = useGetMyDriverSettlementQuery(undefined, {
    ...reads,
    skip: reads.skip || !isDriver,
  });

  const recentPendingSubscriptionPayment = useMemo(
    () => getMostRecentPendingSubscriptionPayment(paymentHistory),
    [paymentHistory],
  );

  const recentPendingSubscriptionOrderNumber = recentPendingSubscriptionPayment?.orderNumber ?? null;

  const paymentHistoryLoaded = Boolean(paymentHistory);

  const hasLoadedVehicles = vehicles !== undefined;

  const isVehicleDataUnavailable = !hasLoadedVehicles && vehiclesLoadError;

  const isVehicleRetrying = !hasLoadedVehicles && vehiclesFetching && !vehiclesLoading;

  const shouldShowVehicleLoadError = isVehicleDataUnavailable || isVehicleRetrying;

  const isProfileDataLoading = !isProfileStatusKnown && (profileLoading || profileFetching);

  // Status cards and onboarding use the same server snapshot as role/identity.
  // The independent vehicle query is only for the detailed editable list.
  const knownVehicleCount = profileVehicleCount;

  const hasVehicle = (knownVehicleCount ?? 0) > 0;

  const userId = currentUser?.id ?? '';

  const { data: reviewsPage } = useGetReviewPageQuery({ userId, limit: 3 }, {
    ...reads,
    skip: reads.skip || !userId,
  });

  const { data: avgRatingData } = useGetAverageRatingQuery(userId, {
    ...reads,
    skip: reads.skip || !userId,
  });

  const reviews = reviewsPage?.data;
  const reviewCount = reviewsPage?.total;
  // A partial page cannot be used to calculate the user's global average.
  const reviewAverage = avgRatingData?.averageRating ?? currentUser?.rating ?? 0;

  const featuredReviews = useMemo(() => (reviews ?? []).slice(0, 3), [reviews]);

  const proPlan = useMemo(
    () => subscriptionPlans.find((plan) => plan.plan === 'pro') ?? subscriptionPlans[0],
    [subscriptionPlans],
  );

  const isPremiumActive = Boolean(
    premiumOverview?.isPremium || premiumOverview?.isActive || currentUser?.isPremium || currentUser?.premiumBadge,
  );

  const proPriceLabel = formatSubscriptionAmount(proPlan?.amount, proPlan?.currency);

  const proEndDateLabel = formatSubscriptionEndDate(premiumOverview?.endDate);

  const tripRequestsStats = useMemo(() => {
    const totalRequests = myTripRequests.length;
    const activeRequests = myTripRequests.filter(
      (req) => req.status === 'pending' || req.status === 'offers_received',
    ).length;
    const requestsWithOffers = myTripRequests.filter(
      (req) => req.status === 'offers_received' && (req.offers?.length || 0) > 0,
    ).length;
    const completedRequests = myTripRequests.filter((req) => req.status === 'driver_selected').length;
    return {
      totalRequests,
      activeRequests,
      requestsWithOffers,
      completedRequests,
    };
  }, [myTripRequests]);

  const handleRefresh = async () => {
    if (!isScreenActive || !user?.id) return;
    setRefreshing(true);
    try {
      const refreshTasks: Promise<unknown>[] = [
        Promise.resolve(refetchProfile()),
        Promise.resolve(refetchVehicles()),
        Promise.resolve(refetchKycStatus()),
        Promise.resolve(refetchReferralSummary()),
      ];
      if (isDriver) {
        refreshTasks.push(Promise.resolve(refetchPremiumOverview()));
        refreshTasks.push(Promise.resolve(refetchPaymentHistory()));
        refreshTasks.push(Promise.resolve(refetchDriverSettlement()));
      }
      await Promise.all(refreshTasks);
    } finally {
      setRefreshing(false);
    }
  };

  const tripRequestsCount = useMemo(() => {
    const activeRequests = myTripRequests.filter((req) => req.status === 'pending' || req.status === 'offers_received');
    return activeRequests.length;
  }, [myTripRequests]);

  const pendingOffersCount = useMemo(() => {
    return myDriverOffers.filter((offer) => offer.status === 'pending').length;
  }, [myDriverOffers]);

  const driverTripsCount = stats?.tripsAsDriver ?? currentUser?.totalTrips ?? 0;

  const passengerBookingsCount = stats?.bookingsAsPassenger ?? 0;

  const driverBookingsCount = stats?.bookingsAsDriver ?? 0;
  return {
    currentUser,
    profileState,
    profileRoleLabel,
    displaysDriverRole,
    driverBookingsCount,
    driverSettlement,
    driverTripsCount,
    featuredReviews,
    handleRefresh,
    hasVehicle,
    hasProfileLoadError,
    isDriver,
    isKycApproved,
    isKycPending,
    isKycRejected,
    isPremiumActive,
    isProfileDataLoading,
    isProfileStatusKnown,
    isIdentityStatusKnown,
    isProfileStatusAvailable,
    isScreenActive,
    knownVehicleCount,
    kycLoading,
    kycStatus,
    needsDriverOnboarding,
    passengerBookingsCount,
    paymentHistoryLoaded,
    pendingOffersCount,
    premiumOverview,
    premiumOverviewFetching,
    profileFetching,
    proEndDateLabel,
    proPriceLabel,
    recentPendingSubscriptionOrderNumber,
    referralSummary,
    refetchKycStatus,
    refetchPaymentHistory,
    refetchPremiumOverview,
    refetchProfile,
    refetchVehicles,
    refreshing,
    reviewAverage,
    reviewCount,
    reviews,
    shouldShowVehicleLoadError,
    tripRequestsCount,
    tripRequestsStats,
    user,
    vehicleList,
    vehiclesFetching,
    vehiclesLoading,
  };
}
