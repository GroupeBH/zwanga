import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Keyboard, Platform } from 'react-native';
import { applyDatePart, applyTimePart, buildPresetWindow } from '@/features/trip-request/requestFormModel';

type Mode = 'date' | 'time';
type Target = 'departure' | 'recurringEndDate';
interface Params {
  isScreenActive: boolean;
  departureDateTime: Date | null;
  hasChosenDepartureTime: boolean;
  setHasChosenDepartureTime: Dispatch<SetStateAction<boolean>>;
  recurringEndDate: Date | null;
  setRecurringEndDate: Dispatch<SetStateAction<Date | null>>;
  setDepartureDateTime: Dispatch<SetStateAction<Date | null>>;
  setIosPickerValue: Dispatch<SetStateAction<Date>>;
  setIosPickerTarget: Dispatch<SetStateAction<Target>>;
  setIosPickerMode: Dispatch<SetStateAction<Mode | null>>;
  iosPickerMode: Mode | null;
  iosPickerTarget: Target;
  iosPickerValue: Date;
}

/** Same explicit date/time choices as requests. Never commit a dismissal or a late native callback. */
export function usePublishScheduleActions(props: Params) {
  const { isScreenActive, setIosPickerMode, setIosPickerTarget } = props;
  const latest = useRef(props); latest.current = props;
  const mounted = useRef(false), generation = useRef(0), androidMode = useRef<Mode | null>(null);
  const opening = useRef(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const invalidate = useCallback(() => {
    generation.current++; opening.current = false;
    const mode = androidMode.current; androidMode.current = null;
    if (mode) void DateTimePickerAndroid.dismiss(mode).catch(() => {});
  }, []);
  const closeIosPicker = useCallback(() => {
    invalidate(); setIosPickerMode(null); setIosPickerTarget('departure'); setPickerError(null);
  }, [invalidate, setIosPickerMode, setIosPickerTarget]);
  useEffect(() => {
    mounted.current = true;
    if (!isScreenActive) closeIosPicker();
    return () => { mounted.current = false; invalidate(); };
  }, [isScreenActive, closeIosPicker, invalidate]);
  const valid = (epoch: number) => mounted.current && latest.current.isScreenActive && epoch === generation.current;
  const baseDate = () => {
    const p = latest.current, suggestion = buildPresetWindow('now').min;
    return p.departureDateTime
      ? p.hasChosenDepartureTime ? new Date(p.departureDateTime) : applyDatePart(p.departureDateTime, suggestion)
      : suggestion;
  };
  const commit = (mode: Mode, target: Target, picked: Date) => {
    if (!Number.isFinite(picked.getTime())) return;
    const p = latest.current;
    if (target === 'recurringEndDate') {
      const end = new Date(picked); end.setHours(0, 0, 0, 0); p.setRecurringEndDate(end);
    } else {
      const base = baseDate();
      p.setDepartureDateTime(current => mode === 'date' ? applyDatePart(picked, current ?? base) : applyTimePart(picked, current ?? base));
      if (mode === 'time') p.setHasChosenDepartureTime(true);
    }
  };
  const openDateOrTimePicker = (mode: Mode, target: Target = 'departure') => {
    if (!mounted.current || !latest.current.isScreenActive || opening.current || latest.current.iosPickerMode) return;
    opening.current = true; Keyboard.dismiss(); setPickerError(null);
    const epoch = ++generation.current, p = latest.current;
    const value = target === 'recurringEndDate' ? p.recurringEndDate ?? p.departureDateTime ?? baseDate() : baseDate();
    if (Platform.OS !== 'android') {
      p.setIosPickerValue(new Date(value)); p.setIosPickerTarget(target); p.setIosPickerMode(mode); return;
    }
    androidMode.current = mode;
    const fail = () => {
      if (!valid(epoch)) return;
      androidMode.current = null; opening.current = false; generation.current++;
      setPickerError('Impossible d’ouvrir le sélecteur. Réessayez.');
    };
    try {
      DateTimePickerAndroid.open({ mode, value, is24Hour: true,
        minimumDate: mode === 'date' ? target === 'recurringEndDate' ? p.departureDateTime ?? new Date() : new Date() : undefined,
        onError: fail,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (!valid(epoch)) return;
          androidMode.current = null; opening.current = false; generation.current++;
          if (event.type === 'set' && date) commit(mode, target, date);
        },
      });
    } catch { fail(); }
  };
  const epoch = generation.current;
  const handleIosPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (valid(epoch) && event.type === 'set' && date && Number.isFinite(date.getTime()) && latest.current.iosPickerMode)
      latest.current.setIosPickerValue(date);
  };
  const confirmIosPicker = () => {
    if (!valid(epoch)) return;
    const p = latest.current;
    if (p.iosPickerMode) commit(p.iosPickerMode, p.iosPickerTarget, p.iosPickerValue);
    closeIosPicker();
  };
  return { openDateOrTimePicker, closeIosPicker, handleIosPickerChange, confirmIosPicker, pickerError };
}
