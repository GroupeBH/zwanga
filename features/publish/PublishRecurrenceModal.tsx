import { FormModal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { usePublishScheduleActions } from '@/hooks/publish/usePublishScheduleActions';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type RecurrenceChoice = { weekdays: number[]; endDate: Date | null };
interface Props {
  departureDateTime: Date | null;
  weekdays: number[];
  endDate: Date | null;
  options: { value: number; label: string }[];
  enabled: boolean;
  onSave: (choice: RecurrenceChoice | null) => void;
  onClose: () => void;
}
const ignore = () => {};
const IOSDatePicker = DateTimePicker as React.ComponentType<React.ComponentProps<typeof DateTimePicker> & {
  locale?: string; themeVariant?: 'light' | 'dark';
}>;

/** Mounted only while editing: cancellation discards the draft, never the saved schedule. */
export function PublishRecurrenceModal(props: Props) {
  const active = useScreenIsActive(), insets = useSafeAreaInsets();
  const [weekdays, setWeekdays] = useState(() => props.weekdays.length ? [...props.weekdays]
    : [(props.departureDateTime ?? new Date()).getDay() || 7]);
  const [endDate, setEndDate] = useState(props.endDate);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [iosPickerTarget, setIosPickerTarget] = useState<'departure' | 'recurringEndDate'>('recurringEndDate');
  const [iosPickerValue, setIosPickerValue] = useState(new Date());
  const picker = usePublishScheduleActions({ isScreenActive: active,
    departureDateTime: props.departureDateTime, hasChosenDepartureTime: true,
    setDepartureDateTime: ignore, setHasChosenDepartureTime: ignore,
    recurringEndDate: endDate, setRecurringEndDate: setEndDate,
    iosPickerMode, setIosPickerMode, iosPickerTarget, setIosPickerTarget, iosPickerValue, setIosPickerValue });
  const start = new Date(props.departureDateTime ?? Date.now()); start.setHours(0, 0, 0, 0);
  const invalidEnd = endDate !== null && (!Number.isFinite(endDate.getTime()) || endDate < start);
  const save = () => {
    if (!active || !weekdays.length || invalidEnd || iosPickerMode) return;
    props.onSave({ weekdays: [...weekdays].sort((a, b) => a - b), endDate });
  };
  const endLabel = endDate && Number.isFinite(endDate.getTime())
    ? endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sans date de fin';
  return <FormModal inApp transparent visible={active} animationType="fade" onRequestClose={props.onClose}>
    <View style={[s.overlay, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={props.onClose}
        accessibilityRole="button" accessibilityLabel="Fermer les jours de répétition" />
      <View style={s.panel} accessibilityViewIsModal>
        <View style={s.header}>
          <View style={s.copy}><Text style={s.title}>Répéter ce trajet</Text>
            <Text style={s.hint}>Quels jours faites-vous ce trajet ?</Text></View>
          <TouchableOpacity style={s.icon} accessibilityRole="button" accessibilityLabel="Annuler la répétition"
            onPress={props.onClose}><Ionicons name="close" size={22} color={Colors.gray[800]} /></TouchableOpacity>
        </View>
        <ScrollView testID="publish-recurrence-content" style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.days}>{props.options.map(day => {
            const selected = weekdays.includes(day.value);
            return <TouchableOpacity key={day.value} style={[s.day, selected && s.selected]}
              accessibilityRole="checkbox" accessibilityLabel={day.label} accessibilityState={{ checked: selected }}
              onPress={() => setWeekdays(current => current.includes(day.value)
                ? current.filter(value => value !== day.value) : [...current, day.value])}>
              <Text style={[s.dayText, selected && s.selectedText]}>{day.label}</Text>
            </TouchableOpacity>;
          })}</View>
          <View style={s.endRow}>
            <TouchableOpacity style={s.endDate} accessibilityRole="button" accessibilityLabel={`Date de fin : ${endLabel}`}
              onPress={() => picker.openDateOrTimePicker('date', 'recurringEndDate')}>
              <Text style={s.hint}>Jusqu’à quand ? (facultatif)</Text><Text style={s.link}>{endLabel}</Text>
            </TouchableOpacity>
            {endDate && <TouchableOpacity style={s.icon} accessibilityRole="button" accessibilityLabel="Retirer la date de fin"
              onPress={() => { picker.closeIosPicker(); setEndDate(null); }}>
              <Ionicons name="close-circle-outline" size={22} color={Colors.gray[600]} /></TouchableOpacity>}
          </View>
          {Platform.OS === 'ios' && iosPickerMode && <View>
            <IOSDatePicker value={iosPickerValue} mode="date" display="spinner" locale="fr-FR"
              themeVariant="light" minimumDate={start} onChange={picker.handleIosPickerChange} />
            <View style={s.pickerActions}>
              <TouchableOpacity style={s.smallAction} accessibilityRole="button" onPress={picker.closeIosPicker}>
                <Text style={s.hint}>Annuler la date</Text></TouchableOpacity>
              <TouchableOpacity style={s.smallAction} accessibilityRole="button" onPress={picker.confirmIosPicker}>
                <Text style={s.link}>Choisir cette date</Text></TouchableOpacity>
            </View>
          </View>}
          {!!picker.pickerError && <Text style={s.error} accessibilityLiveRegion="polite">{picker.pickerError}</Text>}
          {invalidEnd && <Text style={s.error}>La fin doit être après le premier départ.</Text>}
          {!weekdays.length && <Text style={s.error}>Choisissez au moins un jour.</Text>}
        </ScrollView>
        <View testID="publish-recurrence-footer" style={s.actions}>
          <TouchableOpacity style={[s.confirm, (!weekdays.length || invalidEnd || !!iosPickerMode) && s.disabled]}
            accessibilityRole="button" disabled={!weekdays.length || invalidEnd || !!iosPickerMode} onPress={save}>
            <Text style={s.confirmText}>Enregistrer</Text></TouchableOpacity>
          {props.enabled && <TouchableOpacity style={s.smallAction} accessibilityRole="button"
            onPress={() => { if (active) props.onSave(null); }}><Text style={s.link}>Ne plus répéter</Text></TouchableOpacity>}
        </View>
      </View>
    </View>
  </FormModal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: 'rgba(15,23,42,0.4)' },
  panel: { backgroundColor: Colors.white, borderRadius: 20, maxHeight: '100%', width: '100%', maxWidth: 480, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 }, copy: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.gray[900] },
  hint: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  scroll: { flexShrink: 1 }, body: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { minHeight: 44, minWidth: 52, flexGrow: 1, padding: 10, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] },
  selected: { borderColor: Colors.primary, backgroundColor: '#FFF3EC' },
  dayText: { fontSize: 14, color: Colors.gray[700] }, selectedText: { color: Colors.primaryDark, fontWeight: '700' },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, endDate: { flex: 1, minHeight: 48, justifyContent: 'center' },
  link: { fontSize: 14, color: Colors.primaryDark, fontWeight: '600' },
  pickerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  smallAction: { minHeight: 44, padding: 8, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 13, color: Colors.danger }, actions: { padding: 16, borderTopWidth: 1, borderColor: Colors.gray[100] },
  confirm: { backgroundColor: Colors.primary, minHeight: 48, padding: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: Colors.white, fontWeight: '700', fontSize: 16 }, disabled: { opacity: 0.45 },
});
