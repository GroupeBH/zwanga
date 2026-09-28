import {
  applyDatePart,
  applyTimePart,
  buildPresetWindow,
  formatDateLabel,
  formatTimeLabel,
  TIME_PRESET_SYNC_INTERVAL_MS,
  TIME_PRESETS,
  TimePreset
} from '@/features/trip-request/requestFormModel';
import {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Platform
} from 'react-native';
import { useRequestDraft } from './useRequestDraft';

type Props = Pick<ReturnType<typeof useRequestDraft>, 'timePreset' | 'departureDateMin' | 'flexibilityMinutes' | 'setTimePreset' | 'setDepartureDateMin' | 'setFlexibilityMinutes'> & {
  isScreenActive: boolean;
};

export function useRequestSchedule({ isScreenActive, timePreset, departureDateMin, flexibilityMinutes, setTimePreset, setDepartureDateMin, setFlexibilityMinutes }: Props) {
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);

  const departureDateMax = useMemo(
    () => new Date(departureDateMin.getTime() + flexibilityMinutes * 60000),
    [departureDateMin, flexibilityMinutes],
  );

  const timeSummary = useMemo(() => {
    if (flexibilityMinutes === 0) return `${formatDateLabel(departureDateMin)} à ${formatTimeLabel(departureDateMin)}`;
    return `${formatDateLabel(departureDateMin)} entre ${formatTimeLabel(departureDateMin)} et ${formatTimeLabel(departureDateMax)}`;
  }, [departureDateMax, departureDateMin, flexibilityMinutes]);

  const departureTimeRangeLabel = flexibilityMinutes === 0
    ? formatTimeLabel(departureDateMin)
    : `${formatTimeLabel(departureDateMin)} – ${formatTimeLabel(departureDateMax)}`;

  const selectedTimePreset = TIME_PRESETS.find((preset) => preset.id === timePreset) ?? TIME_PRESETS[0];

  const getCurrentDepartureWindow = () => {
    if (timePreset === 'custom') {
      return {
        min: departureDateMin,
        max: departureDateMax,
        flex: flexibilityMinutes,
      };
    }

    const next = buildPresetWindow(timePreset);
    return {
      min: next.min,
      max: new Date(next.min.getTime() + next.flex * 60000),
      flex: next.flex,
    };
  };

  useEffect(() => {
    const preset = timePreset;
    if (preset === 'custom' || !isScreenActive) {
      return;
    }

    const syncPresetWindow = () => {
      const next = buildPresetWindow(preset);
      setDepartureDateMin(next.min);
      setFlexibilityMinutes(next.flex);
    };

    syncPresetWindow();
    const interval = setInterval(syncPresetWindow, TIME_PRESET_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [isScreenActive, timePreset, setDepartureDateMin, setFlexibilityMinutes]);

  const applyPreset = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset === 'custom') return;
    const next = buildPresetWindow(preset);
    setDepartureDateMin(next.min);
    setFlexibilityMinutes(next.flex);
  };

  const openCustomPicker = (mode: 'date' | 'time') => {
    Keyboard.dismiss();
    setTimePreset('custom');
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: departureDateMin,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          setDepartureDateMin((current) =>
            mode === 'date' ? applyDatePart(selectedDate, current) : applyTimePart(selectedDate, current),
          );
        },
      });
      return;
    }
    setIosPickerMode(mode);
  };

  const handleIosPickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !iosPickerMode) return;
    setDepartureDateMin((current) =>
      iosPickerMode === 'date' ? applyDatePart(selectedDate, current) : applyTimePart(selectedDate, current),
    );
  };
  return {
    iosPickerMode,
    setIosPickerMode,
    departureTimeRangeLabel,
    timeSummary,
    selectedTimePreset,
    getCurrentDepartureWindow,
    applyPreset,
    openCustomPicker,
    handleIosPickerChange
  };
}
