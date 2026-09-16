import { Colors } from '@/constants/styles';
import {
  formatReferralTokens
} from '@/features/profile/profileModel';
import { styles } from '@/features/profile/ProfileReferralCard.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Text,
  TouchableOpacity,
  View
} from 'react-native';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'referralSummary'
  | 'router'
>;

export function ProfileReferralCard({
  referralSummary,
  router,
}: Props) {
  return (<Animated.View entering={FadeInDown.delay(80)}>
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => router.push('/referrals' as any)}
      style={styles.referralAccessCard}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir mon espace de parrainage"
    >
      <LinearGradient
        colors={[Colors.primary, Colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.referralAccessGradient}
      >
        <View style={styles.referralAccessIcon}>
          <Ionicons name="gift-outline" size={24} color={Colors.white} />
        </View>
        <View style={styles.referralAccessContent}>
          <Text style={styles.referralAccessTitle}>Invitez et gagnez</Text>
          <Text numberOfLines={2} style={styles.referralAccessMeta}>
            {referralSummary
              ? `${referralSummary.referralCount} filleul${referralSummary.referralCount > 1 ? 's' : ''} · ${formatReferralTokens(referralSummary.balances.availableTokens)} jetons disponibles`
              : 'Partagez votre lien et suivez les gains de vos filleuls'}
          </Text>
        </View>
        <Ionicons name="arrow-forward-circle" size={27} color={Colors.white} />
      </LinearGradient>
    </TouchableOpacity>
  </Animated.View>);
}
