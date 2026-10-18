import {
  applyDatePart, applyTimePart, buildPresetWindow, formatDateLabel, formatTimeLabel,
  DEFAULT_REQUEST_FLEXIBILITY_MINUTES, TIME_PRESET_SYNC_INTERVAL_MS, type TimePreset,
} from '@/features/trip-request/requestFormModel';
import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { useRequestDraft } from './useRequestDraft';

type Mode = 'date' | 'time';
type Props = Pick<ReturnType<typeof useRequestDraft>,
  'timePreset' | 'departureDateMin' | 'flexibilityMinutes' | 'hasChosenDepartureTime' |
  'setTimePreset' | 'setDepartureDateMin' | 'setFlexibilityMinutes' | 'setHasChosenDepartureTime'> & {
  isScreenActive: boolean;
};

export function useRequestSchedule({ isScreenActive, timePreset, departureDateMin, flexibilityMinutes,
  hasChosenDepartureTime, setTimePreset, setDepartureDateMin, setFlexibilityMinutes, setHasChosenDepartureTime }: Props) {
  const [iosPicker, setIosPicker] = useState<{ mode: Mode; value: Date } | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const androidMode = useRef<Mode | null>(null);
  const pickerGeneration = useRef(0);
  const mounted = useRef(false);
  const active = useRef(isScreenActive);
  active.current = isScreenActive;

  const dismissAndroid = useCallback(() => {
    const mode = androidMode.current;
    androidMode.current = null;
    if (mode) void DateTimePickerAndroid.dismiss(mode).catch(() => {});
  }, []);
  const invalidatePicker = useCallback(() => {
    pickerGeneration.current++;
    dismissAndroid();
  }, [dismissAndroid]);
  const closeDatePicker = useCallback(() => {
    invalidatePicker();
    setIosPicker(null);
    setPickerError(null);
  }, [invalidatePicker]);

  useEffect(() => {
    mounted.current = true;
    if (!isScreenActive) closeDatePicker();
    return () => {
      mounted.current = false;
      invalidatePicker();
    };
  }, [isScreenActive, closeDatePicker, invalidatePicker]);

  const departureDateMax = useMemo(
    () => new Date(departureDateMin.getTime() + flexibilityMinutes * 60000),
    [departureDateMin, flexibilityMinutes],
  );
  const timeSummary = useMemo(() => {
    if (!hasChosenDepartureTime) return '';
    const end = departureDateMin.toDateString() === departureDateMax.toDateString()
      ? formatTimeLabel(departureDateMax)
      : `${formatDateLabel(departureDateMax)} à ${formatTimeLabel(departureDateMax)}`;
    return `Départ ${formatDateLabel(departureDateMin)} à ${formatTimeLabel(departureDateMin)} · Jusqu’à ${end}`;
  }, [departureDateMax, departureDateMin, hasChosenDepartureTime]);

  const getCurrentDepartureWindow = () => {
    if (timePreset === 'custom') return { min: departureDateMin, max: departureDateMax, flex: flexibilityMinutes };
    const next = buildPresetWindow(timePreset);
    return { min: next.min, max: new Date(next.min.getTime() + next.flex * 60000), flex: next.flex };
  };

  useEffect(() => {
    if (timePreset === 'custom' || !isScreenActive) return;
    const syncPresetWindow = () => {
      const next = buildPresetWindow(timePreset);
      setDepartureDateMin(next.min);
      setFlexibilityMinutes(next.flex);
    };
    syncPresetWindow();
    const interval = setInterval(syncPresetWindow, TIME_PRESET_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isScreenActive, timePreset, setDepartureDateMin, setFlexibilityMinutes]);

  const applyPreset = (preset: TimePreset) => {
    if (!isScreenActive) return;
    closeDatePicker();
    setTimePreset(preset);
    if (preset === 'custom') return;
    const next = buildPresetWindow(preset);
    setDepartureDateMin(next.min);
    setFlexibilityMinutes(next.flex);
    setHasChosenDepartureTime(true);
  };

  const commitPicker = (mode: Mode, selectedDate: Date) => {
    if (!mounted.current || !active.current || !Number.isFinite(selectedDate.getTime())) return;
    setTimePreset('custom');
    setDepartureDateMin(current => mode === 'date' ? applyDatePart(selectedDate, current) : applyTimePart(selectedDate, current));
    if (timePreset !== 'custom') setFlexibilityMinutes(DEFAULT_REQUEST_FLEXIBILITY_MINUTES);
    if (mode === 'time') setHasChosenDepartureTime(true);
  };

  const openCustomPicker = (mode: Mode) => {
    if (!mounted.current || !isScreenActive || androidMode.current || iosPicker) return;
    Keyboard.dismiss();
    setPickerError(null);
    const generation = ++pickerGeneration.current;
    const failPicker = () => {
      if (!mounted.current || !active.current || generation !== pickerGeneration.current) return;
      androidMode.current = null;
      pickerGeneration.current++;
      setPickerError('Impossible d’ouvrir le sélecteur. Réessayez.');
    };
    // Keep the chosen day. A fresh suggested time is not a confirmed choice.
    const value = hasChosenDepartureTime ? departureDateMin : applyDatePart(departureDateMin, buildPresetWindow('now').min);
    if (Platform.OS === 'android') {
      androidMode.current = mode;
      try {
        DateTimePickerAndroid.open({
          mode, value, is24Hour: true,
          minimumDate: mode === 'date' ? new Date() : undefined,
          onError: failPicker,
          onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
            if (generation !== pickerGeneration.current || !active.current) return;
            androidMode.current = null;
            pickerGeneration.current++;
            if (event.type === 'set' && selectedDate) commitPicker(mode, selectedDate);
          },
        });
      } catch {
        failPicker();
      }
      return;
    }
    setIosPicker({ mode, value });
  };

  const iosGeneration = pickerGeneration.current;
  const handleIosPickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!mounted.current || !active.current || iosGeneration !== pickerGeneration.current ||
      event.type !== 'set' || !selectedDate || !Number.isFinite(selectedDate.getTime())) return;
    setIosPicker(current => current ? { ...current, value: selectedDate } : null);
  };
  const confirmIosPicker = () => {
    if (!mounted.current || !active.current || iosGeneration !== pickerGeneration.current) return;
    if (iosPicker) commitPicker(iosPicker.mode, iosPicker.value);
    closeDatePicker();
  };

  return {
    iosPickerMode: iosPicker?.mode ?? null,
    iosPickerValue: iosPicker?.value ?? departureDateMin,
    timeSummary, pickerError, getCurrentDepartureWindow, applyPreset, openCustomPicker,
    handleIosPickerChange, confirmIosPicker, closeDatePicker,
  };
}
