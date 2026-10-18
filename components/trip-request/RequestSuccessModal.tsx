import { Colors, Spacing } from '@/constants/styles';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import Animated, { FadeIn } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'createdRequestId' | 'goHomeAfterRequestSuccess' | 'goToRequestSuccessDetail' | 'insets' | 'isRequestSuccessVisible' | 'isResolvingSentRequest' | 'requestSuccessDetailLabel' | 'requestSuccessText'>;

export function RequestSuccessModal({
  createdRequestId,
  goHomeAfterRequestSuccess,
  goToRequestSuccessDetail,
  insets,
  isRequestSuccessVisible,
  isResolvingSentRequest,
  requestSuccessDetailLabel,
  requestSuccessText
}: Props) {
  return (<Modal
    inApp
    transparent
    visible={isRequestSuccessVisible}
    animationType="fade"
    presentationStyle="overFullScreen"
    onRequestClose={() => {
      if (!isResolvingSentRequest) {
        goHomeAfterRequestSuccess();
      }
    }}
  >
    <View
      style={[
        styles.requestSuccessOverlay,
        {
          paddingTop: Math.max(insets.top, 24) + Spacing.lg,
          paddingBottom: Math.max(insets.bottom, 24) + Spacing.lg,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.requestSuccessBackdropGlowTop} />
      <View pointerEvents="none" style={styles.requestSuccessBackdropGlowBottom} />

      <Animated.View entering={FadeIn.duration(180)} style={styles.requestSuccessCard}>
        <View style={styles.requestSuccessPill}>
          <Ionicons name="radio-outline" size={14} color={Colors.primary} />
          <Text style={styles.requestSuccessPillText}>Commande de trajet</Text>
        </View>

        <View style={styles.requestSuccessIcon}>
          <Ionicons name={createdRequestId ? 'checkmark' : 'time-outline'} size={42} color={Colors.white} />
        </View>

        <Text style={styles.requestSuccessTitle}>{createdRequestId ? 'Commande envoyée' : isResolvingSentRequest ? 'Vérification en cours' : 'Envoi non confirmé'}</Text>
        <Text style={styles.requestSuccessText}>{requestSuccessText}</Text>

        {isResolvingSentRequest ? (
          <View style={styles.requestSuccessLoadingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.requestSuccessLoadingText}>Recherche du détail…</Text>
          </View>
        ) : (
          <View style={styles.requestSuccessActions}>
            <TouchableOpacity
              style={styles.requestSuccessPrimary}
              onPress={goToRequestSuccessDetail}
              activeOpacity={0.88}
            >
              <Text style={styles.requestSuccessPrimaryText}>{requestSuccessDetailLabel}</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.white} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.requestSuccessSecondary}
              onPress={goHomeAfterRequestSuccess}
              activeOpacity={0.84}
            >
              <Ionicons name="home-outline" size={18} color={Colors.gray[700]} />
              <Text style={styles.requestSuccessSecondaryText}>{createdRequestId ? 'Revenir à l’accueil' : 'Voir mes commandes'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  </Modal>);
}
