import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import type { RideOutboxEntry, RideSnapshot } from './rideRecoveryModel';
import { rideActionResultContent, type RideActionResult } from './rideActionResultModel';
import { resultStyles as styles, resultTones } from './rideActionResultStyles';

export function RideActionResultModal({ result, entry, snapshot, onClose }: {
  result: RideActionResult; entry?: RideOutboxEntry; snapshot?: RideSnapshot; onClose: () => void;
}) {
  const content = rideActionResultContent(result, entry, snapshot);
  const palette = resultTones[content.tone];
  const motion = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let disposed = false, preferenceChanged = false;
    const animate = (reduced: boolean) => {
      if (disposed) return;
      motion.stopAnimation();
      if (reduced) { motion.setValue(1); return; }
      motion.setValue(0);
      Animated.timing(motion, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => { preferenceChanged = true; animate(reduced); });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => { if (!preferenceChanged) animate(reduced); }).catch(() => {});
    return () => { disposed = true; subscription.remove(); motion.stopAnimation(); };
  }, [motion, content.phase]);
  const seats = result.numberOfSeats ?? 1;
  return <RideModal inApp visible transparent animationType="none" priority={RIDE_OVERLAY_PRIORITY.result} onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.overlay}>
      <Animated.View style={[styles.card, { opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
        transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        <View style={styles.topline}>
          <View style={styles.stage}><Ionicons name={result.stage === 'pickup' ? 'car-outline' : 'flag-outline'} size={17} color={palette.accent} />
            <Text style={[styles.eyebrow, { color: palette.accent }]}>{content.stageLabel}</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer le résultat" style={styles.close} onPress={onClose}>
            <Ionicons name="close" size={22} color="#64748B" />
          </TouchableOpacity>
        </View>
        <ScrollView bounces={false} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Animated.View accessible={false} style={[styles.halo, { backgroundColor: palette.soft,
            transform: [{ scale: motion.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
            <View style={[styles.iconDisc, { backgroundColor: palette.accent }]}>
              <Ionicons name={content.icon} size={36} color="white" />
            </View>
          </Animated.View>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>{content.title}</Text>
          <Text style={styles.message}>{content.message}</Text>
          <View style={[styles.status, { backgroundColor: palette.soft }]}>
            {content.phase === 'sending' ? <ActivityIndicator size="small" color={palette.accent} />
              : <View style={[styles.dot, { backgroundColor: palette.accent }]} />}
            <Text accessibilityLiveRegion="polite" style={[styles.statusText, { color: palette.accent }]}>{content.status}</Text>
          </View>
          <Text style={styles.reservation}>{result.actor === 'driver' ? result.passengerName || 'Passager' : 'Votre réservation'}
            {` · ${seats} place${seats > 1 ? 's' : ''}`}</Text>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} onPress={onClose}
            style={[styles.primary, { backgroundColor: palette.accent }]}>
            <Text style={styles.primaryText}>{content.button}</Text>
            <Ionicons name="arrow-forward" size={19} color="white" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  </RideModal>;
}
