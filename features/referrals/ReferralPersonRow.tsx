import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { ReferredUserSummary } from '@/types';
import { formatNumber, formatDate } from './referralModel';
import { styles } from './referralScreenStyles';

export const ReferralPersonRow = memo(function ReferralPersonRow({ referral }: { referral: ReferredUserSummary }) {
  return (<View style={[styles.listPanel, styles.listItem]}>
                  <View style={styles.listIcon}>
                    <Ionicons name="person-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.listBody}>
                    <Text style={styles.listTitle}>
                      {referral.firstName} {referral.lastNameInitial}
                    </Text>
                    <Text style={styles.listMeta}>
                      {referral.qualifiedAt
                        ? `Actif · gains jusqu'au ${formatDate(referral.rewardWindowEndsAt)}`
                        : `Inscrit le ${formatDate(referral.referredAt)} · aucun paiement éligible`}
                    </Text>
                    {referral.earnings.pendingTokens > 0 && (
                      <Text style={styles.pendingEarning}>
                        {formatNumber(referral.earnings.pendingTokens)} jetons en attente
                      </Text>
                    )}
                  </View>
                  <View style={styles.earningSummary}>
                    <Text style={styles.positiveAmount}>
                      +{formatNumber(referral.earnings.earnedTokens)} jetons
                    </Text>
                    <Text style={styles.earningAmount}>
                      {formatNumber(referral.earnings.earnedAmount)}{' '}
                      {referral.earnings.currency} cumulés
                    </Text>
                  </View>
                </View>);
});

