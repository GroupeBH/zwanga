import { DepartureDateTimeFields } from '@/components/forms/DepartureDateTimeFields';
import { Colors } from '@/constants/styles';
import Animated, { type FadeInDown } from '@/utils/reanimated';
import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

interface PublishScheduleStepProps {
  stepEntering: FadeInDown | undefined;
  openDateOrTimePicker: (mode: 'date' | 'time', target?: 'departure' | 'recurringEndDate') => void;
  formattedDateLabel: string;
  formattedTimeLabel: string;
  hasChosenDepartureTime: boolean;
  pickerError: string | null;
  isRecurringTrip: boolean;
  toggleRecurringTrip: () => void;
  recurringWeekdayOptions: { value: number; label: string }[];
  recurringWeekdays: number[];
  toggleRecurringWeekday: (weekday: number) => void;
  formattedRecurringEndDate: string;
  recurringEndDate: Date | null;
  setRecurringEndDate: React.Dispatch<React.SetStateAction<Date | null>>;
}

export function PublishScheduleStep(props: PublishScheduleStepProps) {
  return <Animated.View entering={props.stepEntering} style={s.section}>
    <Text style={s.title}>Quand partez-vous ?</Text>
    <DepartureDateTimeFields dateLabel={props.formattedDateLabel} timeLabel={props.formattedTimeLabel}
      hasChosenTime={props.hasChosenDepartureTime} onOpen={props.openDateOrTimePicker} />
    {!!props.pickerError && <Text style={s.error} accessibilityLiveRegion="polite">{props.pickerError}</Text>}
    <View style={s.row}>
      <Text style={s.label}>Répéter ce trajet</Text>
      <Switch accessibilityLabel="Répéter ce trajet" value={props.isRecurringTrip} onValueChange={props.toggleRecurringTrip}
        trackColor={{ false: Colors.gray[300], true: Colors.primary }} />
    </View>
    {props.isRecurringTrip && <View style={s.recurring}>
      <Text style={s.hint}>Choisissez vos jours habituels.</Text>
      <View style={s.days}>{props.recurringWeekdayOptions.map(day => {
        const selected = props.recurringWeekdays.includes(day.value);
        return <TouchableOpacity key={day.value} style={[s.day, selected && s.selected]}
          accessibilityRole="checkbox" accessibilityLabel={day.label} accessibilityState={{ checked: selected }}
          onPress={() => props.toggleRecurringWeekday(day.value)}>
          <Text style={[s.dayText, selected && s.selectedText]}>{day.label}</Text>
        </TouchableOpacity>;
      })}</View>
      <View style={s.row}>
        <TouchableOpacity style={s.endDate} accessibilityRole="button"
          accessibilityLabel={`Date de fin : ${props.formattedRecurringEndDate}`}
          onPress={() => props.openDateOrTimePicker('date', 'recurringEndDate')}>
          <Text style={s.hint}>Fin (facultatif)</Text><Text style={s.link}>{props.formattedRecurringEndDate}</Text>
        </TouchableOpacity>
        {!!props.recurringEndDate && <TouchableOpacity style={s.clear} accessibilityRole="button"
          accessibilityLabel="Retirer la date de fin" onPress={() => props.setRecurringEndDate(null)}>
          <Text style={s.link}>Retirer</Text>
        </TouchableOpacity>}
      </View>
    </View>}
  </Animated.View>;
}
const s = StyleSheet.create({
  section: { gap: 8, paddingTop: 12 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: 14, color: Colors.gray[800] },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.gray[600] },
  recurring: { gap: 6 }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  day: { minHeight: 44, minWidth: 44, flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white },
  selected: { borderColor: Colors.primary, backgroundColor: '#FFF3EC' },
  dayText: { fontSize: 13, color: Colors.gray[700] }, selectedText: { color: Colors.primaryDark, fontWeight: '700' },
  endDate: { minHeight: 44, flex: 1, justifyContent: 'center', gap: 2 }, clear: { minHeight: 44, justifyContent: 'center', padding: 8 },
  link: { color: Colors.primaryDark, fontSize: 14, fontWeight: '600' }, error: { color: Colors.danger, fontSize: 13 },
});
