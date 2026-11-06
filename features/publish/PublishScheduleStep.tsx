import { PublishStep } from './publishModel';
import { DepartureDateTimeFields } from '@/components/forms/DepartureDateTimeFields';
import { styles } from '../screen-styles/app/publish/index';
import { Colors, Spacing } from '@/constants/styles';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface PublishScheduleStepProps {
  stepEntering: FadeInDown | undefined;
  openDateOrTimePicker: (mode: "date" | "time", target?: "departure" | "recurringEndDate") => void;
  formattedDateLabel: string;
  formattedTimeLabel: string;
  hasChosenDepartureTime: boolean;
  pickerError: string | null;
  isRecurringTrip: boolean;
  toggleRecurringTrip: () => void;
  recurringWeekdayOptions: { value: number; label: string; }[];
  recurringWeekdays: number[];
  toggleRecurringWeekday: (weekday: number) => void;
  recurringDaysSummary: string;
  formattedRecurringEndDate: string;
  recurringEndDate: Date | null;
  setRecurringEndDate: React.Dispatch<React.SetStateAction<Date | null>>;
  insets: EdgeInsets;
  goToStep: (nextStep: PublishStep) => void;
  handleNextStep: () => void;
}

export function PublishScheduleStep({
  stepEntering,
  openDateOrTimePicker,
  formattedDateLabel,
  formattedTimeLabel,
  hasChosenDepartureTime,
  pickerError,
  isRecurringTrip,
  toggleRecurringTrip,
  recurringWeekdayOptions,
  recurringWeekdays,
  toggleRecurringWeekday,
  recurringDaysSummary,
  formattedRecurringEndDate,
  recurringEndDate,
  setRecurringEndDate,
  insets,
  goToStep,
  handleNextStep,
}: PublishScheduleStepProps) {
  return (
    <Animated.View entering={stepEntering} style={styles.stepContainer}>
      <Text style={styles.sectionTitle}>Quand partez-vous ?</Text>

      <View style={{ gap: 8, marginBottom: Spacing.lg }}>
        <DepartureDateTimeFields dateLabel={formattedDateLabel} timeLabel={formattedTimeLabel}
          hasChosenTime={hasChosenDepartureTime} onOpen={openDateOrTimePicker} />
        {pickerError && <Text style={{ color: Colors.danger }} accessibilityLiveRegion="polite">{pickerError}</Text>}
      </View>
      <TouchableOpacity
        style={[
          styles.card,
          styles.recurringToggleCard,
          isRecurringTrip && styles.recurringToggleCardActive,
        ]}
        onPress={toggleRecurringTrip}
        activeOpacity={0.85}
      >
        <View style={styles.freeTripContent}>
          <Text style={styles.freeTripTitle}>Vous effectuez souvent ce trajet ?</Text>
          <Text style={styles.freeTripSubtitle}>
            Choisissez vos jours habituels, Zwanga le publiera pour vous.
          </Text>
        </View>
        <View style={[styles.toggleSwitch, isRecurringTrip && styles.toggleSwitchActive]}>
          <View style={[styles.toggleThumb, isRecurringTrip && styles.toggleThumbActive]} />
        </View>
      </TouchableOpacity>

      {isRecurringTrip && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>TRAJET HABITUEL</Text>
          <Text style={styles.recurringSectionTitle}>Quels jours ?</Text>
          <View style={styles.recurringDayRow}>
            {recurringWeekdayOptions.map((option) => {
              const isSelected = recurringWeekdays.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.recurringDayChip,
                    isSelected && styles.recurringDayChipActive,
                  ]}
                  onPress={() => toggleRecurringWeekday(option.value)}
                >
                  <Text
                    style={[
                      styles.recurringDayChipText,
                      isSelected && styles.recurringDayChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.recurringSummaryCard}>
            <Ionicons name="repeat" size={18} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.recurringSummaryLabel}>Vos jours</Text>
              <Text style={styles.recurringSummaryValue}>
                {recurringDaysSummary || 'Choisissez au moins un jour'} à {formattedTimeLabel}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.recurringEndDateButton}
            onPress={() => openDateOrTimePicker('date', 'recurringEndDate')}
          >
            <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.gray[200] }]}>
              <Ionicons name="calendar-outline" size={18} color={Colors.gray[700]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.datetimeButtonLabel}>Date de fin optionnelle</Text>
              <Text style={styles.datetimeButtonValue}>{formattedRecurringEndDate}</Text>
            </View>
            {recurringEndDate ? (
              <TouchableOpacity
                onPress={() => setRecurringEndDate(null)}
                style={styles.clearRecurringEndDateButton}
              >
                <Ionicons name="close" size={16} color={Colors.gray[600]} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => goToStep('route')}
        >
          <Text style={styles.buttonSecondaryText}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]}
          onPress={() => hasChosenDepartureTime ? handleNextStep() : openDateOrTimePicker('time')}>
          <Text style={styles.buttonText}>{hasChosenDepartureTime ? 'Continuer' : 'Choisir l’heure'}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
