import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import {
  formatReferralTokens,
} from '@/features/profile/profileModel';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { getServicesEntryHref, selectUsesServicesTab } from '@/features/navigation/accountTabPolicy';
import { performLogout } from '@/store/slices/authSlice';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfileData } from './useProfileData';
import { useProfileOnboarding } from './useProfileOnboarding';
import { useProfilePin } from './useProfilePin';
import { useProfileSubscriptionCard } from './useProfileSubscriptionCard';
import { useProfileSubscriptionCheckout } from './useProfileSubscriptionCheckout';
import { useProfileSubscriptionLifecycle } from './useProfileSubscriptionLifecycle';
import { useProfileSubscriptionMonitor } from './useProfileSubscriptionMonitor';
import { useProfileSubscriptionRecovery } from './useProfileSubscriptionRecovery';
import { useProfileSubscriptionState } from './useProfileSubscriptionState';
import { useProfileSubscriptionStorage } from './useProfileSubscriptionStorage';
import { useProfileSubscriptionView } from './useProfileSubscriptionView';
import { useProfileVehicles } from './useProfileVehicles';
export function useProfileController() {
  const router = useRouter();
  const usesServices = useAppSelector(selectUsesServicesTab);

  const insets = useSafeAreaInsets();

  const dispatch = useAppDispatch();

  const { showDialog } = useDialog();

  const data = useProfileData();

  const vehicles = useProfileVehicles({ ...data });

  const pin = useProfilePin({ ...data });

  const onboarding = useProfileOnboarding({ ...data, ...vehicles });

  const subscriptionState = useProfileSubscriptionState({ ...data });

  const subscriptionStorage = useProfileSubscriptionStorage({ ...data });

  const subscriptionMonitor = useProfileSubscriptionMonitor({ ...subscriptionState, ...subscriptionStorage, ...data });

  const subscriptionCard = useProfileSubscriptionCard({ ...subscriptionState, ...subscriptionMonitor });

  const subscriptionRecovery = useProfileSubscriptionRecovery({ ...subscriptionState, ...data, ...subscriptionMonitor, ...subscriptionStorage, ...subscriptionCard });

  const subscriptionCheckout = useProfileSubscriptionCheckout({ ...subscriptionMonitor, ...subscriptionState, ...data, ...subscriptionRecovery, ...subscriptionStorage, ...subscriptionCard });

  const subscriptionView = useProfileSubscriptionView({ ...subscriptionCheckout, ...subscriptionMonitor, ...subscriptionState, ...data });

  useProfileSubscriptionLifecycle({ ...subscriptionStorage, ...data, ...subscriptionState, ...subscriptionRecovery, ...subscriptionMonitor });

  const { driverBookingsCount, driverSettlement, handleOpenPinModal, handleStartDriverOnboarding, hasVehicle, isDriver, isKycBusy, isPremiumActive, isUpdatingUser, knownVehicleCount, needsDriverOnboarding, passengerBookingsCount, pendingOffersCount, proBusy, shouldShowVehicleLoadError, tripRequestsCount, tripRequestsStats } = { ...data, ...onboarding, ...subscriptionView, ...pin, ...vehicles, ...subscriptionState, ...subscriptionCheckout, ...subscriptionMonitor };

  const { changeProfilePhoto, isUploading } = useProfilePhoto();

  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);

  const openingDocumentsPack = false;

  const { shouldShow: shouldShowProfileGuide, complete: completeProfileGuide } = useTutorialGuide('profile_screen');

  const [profileGuideVisible, setProfileGuideVisible] = useState(false);

  useEffect(() => {
    if (shouldShowProfileGuide) {
      setProfileGuideVisible(true);
    }
  }, [shouldShowProfileGuide]);

  const handleDismissProfileGuide = () => {
    setProfileGuideVisible(false);
    completeProfileGuide();
  };

  const handleSubscribePro = async () => {
    if (needsDriverOnboarding) {
      handleStartDriverOnboarding();
      return;
    }

    if (isPremiumActive) {
      return;
    }

    router.push('/subscriptions/payment' as any);
  };

  const handleOpenDocumentsPack = () => {
    const href = getServicesEntryHref(usesServices);
    if (usesServices) router.navigate(href as any);
    else router.push(href as any);
  };

  const driverStatusItems = isDriver ? [
    {
      icon: 'car-outline' as keyof typeof Ionicons.glyphMap,
      label: 'Véhicule',
      value: hasVehicle
        ? `${knownVehicleCount} ajouté${knownVehicleCount !== 1 ? 's' : ''}`
        : shouldShowVehicleLoadError && knownVehicleCount === undefined
          ? 'Indisponible'
          : 'À ajouter',
      color: hasVehicle
        ? Colors.success
        : shouldShowVehicleLoadError && knownVehicleCount === undefined
          ? Colors.gray[500]
          : Colors.warning,
    },
    {
      icon: isPremiumActive
        ? ('shield-checkmark-outline' as keyof typeof Ionicons.glyphMap)
        : ('sparkles-outline' as keyof typeof Ionicons.glyphMap),
      label: 'Pro',
      value: needsDriverOnboarding ? 'Profil incomplet' : isPremiumActive ? 'Actif' : 'Disponible',
      color: needsDriverOnboarding ? Colors.gray[500] : isPremiumActive ? Colors.success : Colors.primary,
    },
  ] : [];

  const priorityCta = !isDriver
    ? {
      label: 'Devenir conducteur',
      icon: 'car-sport-outline' as keyof typeof Ionicons.glyphMap,
      onPress: handleStartDriverOnboarding,
    }
    : needsDriverOnboarding
    ? {
      label: 'Devenir conducteur',
      icon: 'car-sport-outline' as keyof typeof Ionicons.glyphMap,
      onPress: handleStartDriverOnboarding,
    }
    : isDriver && !isPremiumActive
      ? {
        label: 'Activer Pro',
        icon: 'sparkles-outline' as keyof typeof Ionicons.glyphMap,
        onPress: handleSubscribePro,
      }
      : {
        label: 'Jetons Zwanga',
        icon: 'wallet-outline' as keyof typeof Ionicons.glyphMap,
        onPress: () => router.push('/wallet' as any),
      };

  const isPriorityCtaBusy = needsDriverOnboarding
    ? isUpdatingUser || isKycBusy || data.kycLoading || data.vehiclesLoading
    : proBusy;

  const shouldShowProDetailsCard = !needsDriverOnboarding && isPremiumActive;

  const quickActionItems = [
    {
      icon: 'calendar-outline' as keyof typeof Ionicons.glyphMap,
      label: 'Reservations',
      meta: `${passengerBookingsCount + driverBookingsCount} au total`,
      onPress: () => router.push('/bookings'),
    },
    {
      icon: 'document-text-outline' as keyof typeof Ionicons.glyphMap,
      label: 'Demandes',
      meta: `${tripRequestsStats.activeRequests} actives`,
      badge: tripRequestsCount > 0 ? tripRequestsCount : undefined,
      onPress: () => router.push('/my-requests'),
    },
    {
      icon: 'wallet-outline' as keyof typeof Ionicons.glyphMap,
      label: 'Jetons',
      meta: 'Solde et partage',
      onPress: () => router.push('/wallet' as any),
    },
    ...(isDriver
      ? [
        {
          icon: 'cash-outline' as keyof typeof Ionicons.glyphMap,
          label: 'Revenus',
          meta: `${formatReferralTokens(driverSettlement?.availableBalance)} ${driverSettlement?.currency ?? 'CDF'} disponibles`,
          onPress: () => router.push('/driver-earnings' as any),
        },
      ]
      : []),
    {
      icon: 'person-outline' as keyof typeof Ionicons.glyphMap,
      label: 'Infos',
      meta: 'Profil personnel',
      onPress: () => router.push('/edit-profile'),
    },
  ];

  const menuItems = [
    {
      icon: 'lock-closed-outline',
      label: 'Modifier le code PIN',
      route: null,
      onPress: handleOpenPinModal,
    },
    {
      icon: 'star-outline',
      label: 'Lieux favoris',
      route: '/favorite-locations',
    },
    ...(isDriver
      ? [
        {
          icon: 'list-outline',
          label: 'Demandes disponibles',
          route: '/requests',
          badge: pendingOffersCount > 0 ? pendingOffersCount : undefined,
          badgeColor: Colors.info,
        },
      ]
      : []),
    {
      icon: 'notifications-outline',
      label: 'Notifications',
      route: '/notifications',
    },
    { icon: 'help-circle-outline', label: 'Aide & Support', route: '/support' },
  ];

  const handleLogout = () => {
    dispatch(performLogout());
  };
  return {
    ...data,
    ...vehicles,
    ...pin,
    ...onboarding,
    ...subscriptionState,
    ...subscriptionStorage,
    ...subscriptionMonitor,
    ...subscriptionCard,
    ...subscriptionRecovery,
    ...subscriptionCheckout,
    ...subscriptionView,
    changeProfilePhoto,
    driverStatusItems,
    handleDismissProfileGuide,
    handleLogout,
    handleOpenDocumentsPack,
    handleSubscribePro,
    insets,
    isPriorityCtaBusy,
    isUploading,
    menuItems,
    openingDocumentsPack,
    priorityCta,
    profileGuideVisible,
    quickActionItems,
    reviewsModalVisible,
    router,
    setReviewsModalVisible,
    shouldShowProDetailsCard,
  };
}
