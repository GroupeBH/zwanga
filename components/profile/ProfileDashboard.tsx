import { Colors } from '@/constants/styles';
import { ProfileIdentitySection } from './ProfileIdentitySection';
import { ProfileDriverJourney } from './ProfileDriverJourney';
import { styles } from '@/features/profile/ProfileDashboard.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'driverStatusItems'
  | 'profileState'
  | 'handleStartDriverOnboarding'
  | 'driverTripsCount'
  | 'handleOpenKycModal'
  | 'isDriver'
  | 'isKycApproved'
  | 'isIdentityStatusKnown'
  | 'isKycPending'
  | 'isKycBusy'
  | 'kycLoading'
  | 'isKycRejected'
  | 'isPriorityCtaBusy'
  | 'kycStatus'
  | 'priorityCta'
  | 'quickActionItems'
>;

export function ProfileDashboard({
  driverStatusItems,
  profileState,
  handleStartDriverOnboarding,
  driverTripsCount,
  handleOpenKycModal,
  isDriver,
  isKycApproved,
  isIdentityStatusKnown,
  isKycPending,
  isKycBusy,
  kycLoading,
  isKycRejected,
  isPriorityCtaBusy,
  kycStatus,
  priorityCta,
  quickActionItems,
}: Props) {
  const showJourney = profileState && profileState.driver.nextAction !== 'none';
  const showPassengerIdentity = profileState?.driver.status === 'not_requested';
  return (<Animated.View entering={FadeInDown.delay(120)} style={styles.profileOverviewPanel}>
    {showJourney ? <ProfileDriverJourney state={profileState} busy={isPriorityCtaBusy}
      onContinue={handleStartDriverOnboarding} /> : (
    <View style={[styles.profileOverviewHeader, !isDriver && styles.passengerOverviewHeader]}>
      <View style={styles.profileOverviewTitleBlock}>
        <Text style={styles.profileOverviewTitle}>Tableau de bord</Text>
        <Text style={styles.profileOverviewSubtitle}>
          {isDriver ? `${driverTripsCount} trajets publies` : 'Profil passager'}
        </Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={isPriorityCtaBusy}
        onPress={priorityCta.onPress}
        accessibilityRole="button"
        style={[styles.profileOverviewCta, !isDriver && styles.becomeDriverButton, isPriorityCtaBusy && styles.profileOverviewCtaDisabled]}
      >
        {isPriorityCtaBusy ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <>
            <Ionicons name={priorityCta.icon} size={16} color={Colors.white} />
            <Text style={styles.profileOverviewCtaText}>
              {priorityCta.label}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>)}

    {showPassengerIdentity && <ProfileIdentitySection
      known={isIdentityStatusKnown}
      approved={isKycApproved}
      pending={isKycPending}
      rejected={isKycRejected}
      busy={isKycBusy || kycLoading || isPriorityCtaBusy}
      onPress={handleOpenKycModal}
    />}

    {driverStatusItems.length > 0 && <View style={styles.driverStatusGrid}>
      {driverStatusItems.map((item) => (
        <View key={item.label} style={styles.driverStatusItem}>
          <View style={[styles.driverStatusIcon, { backgroundColor: item.color + '14' }]}>
            <Ionicons name={item.icon} size={16} color={item.color} />
          </View>
          <Text style={styles.driverStatusLabel}>{item.label}</Text>
          <Text numberOfLines={1} style={[styles.driverStatusValue, { color: item.color }]}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>}

    {showPassengerIdentity && isKycRejected && kycStatus?.rejectionReason ? (
      <TouchableOpacity activeOpacity={0.85} onPress={handleOpenKycModal} style={styles.profileAlert}>
        <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
        <Text numberOfLines={2} style={styles.profileAlertText}>
          {kycStatus?.rejectionReason}
        </Text>
      </TouchableOpacity>
    ) : null}

    <View style={styles.quickActionsGrid}>
      {quickActionItems.map((item) => (
        <TouchableOpacity
          key={item.label}
          activeOpacity={0.85}
          onPress={item.onPress}
          style={styles.quickActionButton}
        >
          <View style={styles.quickActionIconWrap}>
            <Ionicons name={item.icon} size={19} color={Colors.primary} />
            {item.badge ? (
              <View style={styles.quickActionBadge}>
                <Text style={styles.quickActionBadgeText}>{item.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.quickActionLabel}>{item.label}</Text>
          <Text numberOfLines={1} style={styles.quickActionMeta}>
            {item.meta}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  </Animated.View>);
}
