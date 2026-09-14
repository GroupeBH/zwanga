import { Colors } from '@/constants/styles';
import {
  formatSubscriptionAmount,
  getPlanLabel
} from '@/features/profile/profileModel';
import { styles } from '@/features/profile/ProfileProCard.styles';
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
  | 'handleStartDriverOnboarding'
  | 'handleSubscribePro'
  | 'isPremiumActive'
  | 'isUpdatingUser'
  | 'needsDriverOnboarding'
  | 'premiumOverview'
  | 'proBusy'
  | 'proEndDateLabel'
  | 'proPriceLabel'
  | 'shouldShowProDetailsCard'
>;

export function ProfileProCard({
  handleStartDriverOnboarding,
  handleSubscribePro,
  isPremiumActive,
  isUpdatingUser,
  needsDriverOnboarding,
  premiumOverview,
  proBusy,
  proEndDateLabel,
  proPriceLabel,
  shouldShowProDetailsCard,
}: Props) {
  return (shouldShowProDetailsCard && (
    <Animated.View entering={FadeInDown.delay(260)}>
      <View style={[styles.proCard, isPremiumActive && styles.proCardActive]}>
        <View style={styles.proHeader}>
          <View style={[styles.proIcon, isPremiumActive && styles.proIconActive]}>
            <Ionicons
              name={isPremiumActive ? 'shield-checkmark' : 'sparkles-outline'}
              size={22}
              color={isPremiumActive ? Colors.white : Colors.primary}
            />
          </View>
          <View style={styles.proTitleContent}>
            <View style={styles.proTitleRow}>
              <Text style={styles.proTitle}>Zwanga Pro</Text>
              {isPremiumActive && (
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>Actif</Text>
                </View>
              )}
            </View>
            <Text style={styles.proSubtitle} numberOfLines={2}>
              {!needsDriverOnboarding
                ? '5 trajets par jour inclus, abonnement pour publier sans blocage.'
                : 'Complétez votre profil conducteur avant de publier des trajets.'}
            </Text>
          </View>
        </View>

        <View style={styles.proBenefitRow}>
          <View style={styles.proBenefitPill}>
            <Ionicons name="ribbon-outline" size={14} color={Colors.primary} />
            <Text style={styles.proBenefitText}>{proPriceLabel}/mois</Text>
          </View>
          <View style={styles.proBenefitPill}>
            <Ionicons name="trending-up-outline" size={14} color={Colors.info} />
            <Text style={styles.proBenefitText}>Plus de 5 trajets/jour</Text>
          </View>
        </View>

        {!needsDriverOnboarding && premiumOverview?.documentFundingEnabled && (
          <Text style={styles.proFundingText} numberOfLines={2}>
            {"Financement documents jusqu'à "}
            {formatSubscriptionAmount(
              premiumOverview.documentFundingLimit ?? undefined,
              premiumOverview.documentFundingCurrency,
            )}
            {'.'}
          </Text>
        )}

        {needsDriverOnboarding ? (
          <TouchableOpacity
            style={styles.proPrimaryButton}
            onPress={handleStartDriverOnboarding}
            disabled={isUpdatingUser}
            activeOpacity={0.85}
          >
            {isUpdatingUser ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Text style={styles.proPrimaryButtonText}>Devenir conducteur</Text>
                <Ionicons name="arrow-forward" size={16} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>
        ) : isPremiumActive ? (
          <View style={styles.proActivePanel}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.proActiveText} numberOfLines={2}>
              Pack {getPlanLabel(premiumOverview?.plan)} actif
              {proEndDateLabel ? ` jusqu'au ${proEndDateLabel}` : ''}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.proSecondaryButton}
            onPress={handleSubscribePro}
            disabled={proBusy}
            activeOpacity={0.85}
          >
            {proBusy ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Text style={styles.proSecondaryButtonText}>{"S'abonner \u00e0 Zwanga Pro"}</Text>
                <Text style={styles.proSecondaryPrice}>{proPriceLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  ));
}
