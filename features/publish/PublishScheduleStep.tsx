import { DepartureDateTimeFields } from '@/components/forms/DepartureDateTimeFields';
import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import Animated, { type FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PublishRecurrenceModal, type RecurrenceChoice } from './PublishRecurrenceModal';

interface PublishScheduleStepProps {
  stepEntering: FadeInDown | undefined;
  openDateOrTimePicker: (mode: 'date' | 'time', target?: 'departure' | 'recurringEndDate') => void;
  selectDepartureIn?: (minutes: number) => void;
  formattedDateLabel: string;
  formattedTimeLabel: string;
  hasChosenDepartureTime: boolean;
  pickerError: string | null;
  departureDateTime: Date | null;
  isRecurringTrip: boolean;
  recurringWeekdayOptions: { value: number; label: string }[];
  recurringWeekdays: number[];
  recurringEndDate: Date | null;
  onSaveRecurrence: (choice: RecurrenceChoice | null) => void;
}

export function PublishScheduleStep(props: PublishScheduleStepProps) {
  const active = useScreenIsActive();
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!active) setEditing(false); }, [active]);
  const days = props.recurringWeekdayOptions.filter(day => props.recurringWeekdays.includes(day.value)).map(day => day.label).join(' · ');
  return <Animated.View entering={props.stepEntering} style={s.section}>
    {!props.isRecurringTrip && props.selectDepartureIn && <View style={s.quickTimes}>
      {[5, 15, 30].map(minutes => <TouchableOpacity key={minutes} style={s.quickTime}
        accessibilityRole="button" accessibilityLabel={`Partir dans ${minutes} minutes`}
        onPress={() => props.selectDepartureIn?.(minutes)}>
        <Text style={s.link}>Dans {minutes} min</Text>
      </TouchableOpacity>)}
    </View>}
    <DepartureDateTimeFields compact dateLabel={props.formattedDateLabel} timeLabel={props.formattedTimeLabel}
      hasChosenTime={props.hasChosenDepartureTime} onOpen={props.openDateOrTimePicker} />
    {!!props.pickerError && <Text style={s.error} accessibilityLiveRegion="polite">{props.pickerError}</Text>}
    <TouchableOpacity style={s.repeat} accessibilityRole="button" accessibilityLabel="Répéter ce trajet"
      accessibilityHint={props.isRecurringTrip ? `Modifier les jours : ${days}` : 'Choisir les jours dans une fenêtre'}
      accessibilityState={{ expanded: editing }} onPress={() => { if (active) setEditing(true); }}>
      <Ionicons name="repeat" size={20} color={Colors.primaryDark} />
      <View style={s.copy}><Text style={s.label}>Répéter ce trajet</Text>
        {props.isRecurringTrip && <Text style={s.hint}>{days}</Text>}</View>
      <Text style={s.link}>{props.isRecurringTrip ? 'Modifier' : 'Choisir'}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.gray[500]} />
    </TouchableOpacity>
    {editing && active && <PublishRecurrenceModal departureDateTime={props.departureDateTime}
      weekdays={props.recurringWeekdays} endDate={props.recurringEndDate} options={props.recurringWeekdayOptions}
      enabled={props.isRecurringTrip} onClose={() => setEditing(false)}
      onSave={choice => { if (!active) return; props.onSaveRecurrence(choice); setEditing(false); }} />}
  </Animated.View>;
}
const s = StyleSheet.create({
  quickTimes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickTime: { minHeight: 44, flex: 1, minWidth: 84, justifyContent: 'center', alignItems: 'center',
    borderRadius: 10, backgroundColor: '#FFF3EC', paddingHorizontal: 8 },
  section: { gap: 6, paddingTop: 8 },
  repeat: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { flex: 1, minWidth: 0 }, label: { fontSize: 14, color: Colors.gray[800] },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.gray[600] },
  link: { color: Colors.primaryDark, fontSize: 13, fontWeight: '600' }, error: { color: Colors.danger, fontSize: 13 },
});
