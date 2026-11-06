import { Colors } from '@/constants/styles';
import { DepartureDateTimeFields } from '@/components/forms/DepartureDateTimeFields';
import { FLEX_OPTIONS, formatRequestDayLabel, formatTimeLabel } from '@/features/trip-request/requestFormModel';
import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = Pick<RequestTripController, 'departureDateMin' | 'hasChosenDepartureTime' |
  'flexibilityMinutes' | 'openCustomPicker' | 'setFlexibilityMinutes' | 'timePreset' | 'timeSummary' | 'pickerError'>;

export function RequestScheduleFields({ departureDateMin, hasChosenDepartureTime,
  flexibilityMinutes, openCustomPicker, setFlexibilityMinutes, timePreset, timeSummary, pickerError }: Props) {
  const [showFlexibility, setShowFlexibility] = useState(false);
  const dateLabel = formatRequestDayLabel(departureDateMin);
  const timeLabel = hasChosenDepartureTime ? formatTimeLabel(departureDateMin) : 'Choisir l’heure';
  return <View style={styles.section}>
    <Text style={styles.title}>Départ souhaité</Text>
    <DepartureDateTimeFields dateLabel={dateLabel} timeLabel={timeLabel}
      hasChosenTime={hasChosenDepartureTime} onOpen={openCustomPicker} />
    {pickerError && <Text style={styles.error} accessibilityLiveRegion="polite">{pickerError}</Text>}
    {hasChosenDepartureTime && <Text style={styles.summary} accessibilityLiveRegion="polite">{timeSummary}</Text>}
    {timePreset === 'custom' && <>
      <TouchableOpacity onPress={() => setShowFlexibility(value => !value)} style={styles.flexToggle}
        accessibilityRole="button" accessibilityState={{ expanded: showFlexibility }} activeOpacity={0.75}>
        <Text style={styles.flexLabel}>Je peux attendre {flexibilityMinutes >= 60 ? `${flexibilityMinutes / 60} h` : `${flexibilityMinutes} min`}</Text>
        <Ionicons name={showFlexibility ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray[600]} />
      </TouchableOpacity>
      {showFlexibility && <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.shortcuts}>
        {FLEX_OPTIONS.map(minutes => <TouchableOpacity key={minutes} onPress={() => { setFlexibilityMinutes(minutes); setShowFlexibility(false); }}
          accessibilityRole="radio" accessibilityState={{ checked: flexibilityMinutes === minutes }}
          accessibilityLabel={`Attendre au maximum ${minutes} minutes après l’heure choisie`}
          style={[styles.shortcut, flexibilityMinutes === minutes && styles.selected]}>
          <Text style={styles.shortcutLabel}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}</Text>
        </TouchableOpacity>)}
      </Animated.View>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  title: { fontSize: 18, fontWeight: '700', color: Colors.gray[900] },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcut: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: Colors.gray[50] },
  selected: { backgroundColor: Colors.primary + '15' },
  shortcutLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray[700] },
  summary: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  flexToggle: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  flexLabel: { fontSize: 13, color: Colors.gray[600] },
  error: { fontSize: 13, lineHeight: 19, color: Colors.danger },
});
