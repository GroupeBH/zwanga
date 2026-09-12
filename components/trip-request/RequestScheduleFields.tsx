import { Colors } from '@/constants/styles';
import { FLEX_OPTIONS, formatDateLabel, formatTimeLabel, TIME_PRESETS } from '@/features/trip-request/requestFormModel';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'applyPreset' | 'departureDateMin' | 'departureTimeRangeLabel' | 'flexibilityMinutes' | 'openCustomPicker' | 'selectedTimePreset' | 'setFlexibilityMinutes' | 'timePreset' | 'timeSummary'>;

export function RequestScheduleFields({
  applyPreset,
  departureDateMin,
  departureTimeRangeLabel,
  flexibilityMinutes,
  openCustomPicker,
  selectedTimePreset,
  setFlexibilityMinutes,
  timePreset,
  timeSummary
}: Props) {
  return (<View style={styles.offerTimeCompactBlock}>
    <View
      style={styles.offerTimeCompactRow}
      accessibilityLabel={`Départ ${timeSummary}`}
    >
      <View style={styles.offerTimeCompactIcon}>
        <Ionicons name={selectedTimePreset.icon} size={18} color={Colors.primary} />
      </View>
      <View style={styles.offerTimeCompactCopy}>
        <Text style={styles.offerTimeCompactLabel}>Départ</Text>
        <Text
          style={styles.offerTimeCompactValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {formatDateLabel(departureDateMin)} · {departureTimeRangeLabel}
        </Text>
      </View>
    </View>

    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.offerPresetCompactScroll}
    >
      {TIME_PRESETS.map((preset) => {
        const active = timePreset === preset.id;
        const compactLabel =
          preset.id === 'soon'
            ? '30 min'
            : preset.id === 'custom'
              ? 'Choisir'
              : preset.label;
        return (
          <TouchableOpacity
            key={preset.id}
            style={[styles.offerPresetCompact, active && styles.offerPresetActive]}
            onPress={() => applyPreset(preset.id)}
            activeOpacity={0.82}
          >
            <Ionicons name={preset.icon} size={14} color={active ? Colors.white : Colors.gray[600]} />
            <Text style={[styles.offerPresetCompactText, active && styles.offerPresetTextActive]} numberOfLines={1}>
              {compactLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>

    {timePreset === 'custom' && (
      <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.customCompactWrap}>
        <View style={styles.customDateTimeRow}>
          <TouchableOpacity style={styles.customPickerPill} onPress={() => openCustomPicker('date')}>
            <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
            <Text style={styles.customPickerPillText} numberOfLines={1}>
              {formatDateLabel(departureDateMin)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.customPickerPill} onPress={() => openCustomPicker('time')}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
            <Text style={styles.customPickerPillText}>{formatTimeLabel(departureDateMin)}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.flexCompactRow}>
          <Text style={styles.flexCompactLabel}>Marge</Text>
          {FLEX_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.flexCompactChip, flexibilityMinutes === option && styles.flexChipActive]}
              onPress={() => setFlexibilityMinutes(option)}
              activeOpacity={0.8}
            >
              <Text style={[styles.flexCompactChipText, flexibilityMinutes === option && styles.flexChipTextActive]}>
                {option === 0 ? 'Exact' : option === 60 ? '1 h' : option === 120 ? '2 h' : `${option} min`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    )}
  </View>);
}
