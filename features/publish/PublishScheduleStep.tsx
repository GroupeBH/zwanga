import { PublishStep } from './publishModel';
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

      <View style={styles.card}>
        <Text style={styles.cardLabel}>DATE ET HEURE DE DÉPART</Text>
        <View style={styles.datetimeButtons}>
          <TouchableOpacity
            style={styles.datetimeButton}
            onPress={() => openDateOrTimePicker('date')}
          >
            <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.primary + '15' }]}>
              <Ionicons name="calendar" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.datetimeButtonLabel}>Date</Text>
              <Text style={styles.datetimeButtonValue} numberOfLines={1} ellipsizeMode="tail">{formattedDateLabel}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.datetimeButton}
            onPress={() => openDateOrTimePicker('time')}
          >
            <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.gray[200] }]}>
              <Ionicons name="time" size={18} color={Colors.gray[700]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.datetimeButtonLabel}>Heure</Text>
              <Text style={styles.datetimeButtonValue} numberOfLines={1} ellipsizeMode="tail">{formattedTimeLabel}</Text>
            </View>
          </TouchableOpacity>
        </View>
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

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
        <Text style={styles.infoText}>
          Choisissez une date et une heure précises pour que les passagers puissent mieux planifier.
        </Text>
      </View>

      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => goToStep('route')}
        >
          <Text style={styles.buttonSecondaryText}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handleNextStep}>
          <Text style={styles.buttonText}>Continuer</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
