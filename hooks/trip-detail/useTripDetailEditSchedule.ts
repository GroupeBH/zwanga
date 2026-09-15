import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform } from 'react-native';

interface Params {
  editDateTime: Date | null;
  setEditDateTime: React.Dispatch<React.SetStateAction<Date | null>>;
  setIosPickerMode: React.Dispatch<React.SetStateAction<"date" | "time" | null>>;
  iosPickerMode: "date" | "time" | null;
}

export function useTripDetailEditSchedule({
  editDateTime,
  setEditDateTime,
  setIosPickerMode,
  iosPickerMode,
}: Params) {
  const getDefaultFutureDate = () => {
    const base = new Date();
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
    return base;
  };

  const getEditBaseDate = () => {
    if (editDateTime) {
      return new Date(editDateTime);
    }
    return getDefaultFutureDate();
  };

  const applyEditDatePart = (pickedDate: Date) => {
    const base = getEditBaseDate();
    const next = new Date(base);
    next.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
    return next;
  };

  const applyEditTimePart = (pickedDate: Date) => {
    const base = getEditBaseDate();
    const next = new Date(base);
    next.setHours(pickedDate.getHours(), pickedDate.getMinutes(), 0, 0);
    return next;
  };

  const openDateOrTimePicker = (mode: 'date' | 'time') => {
    const value = getEditBaseDate();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) {
            return;
          }
          setEditDateTime(mode === 'date' ? applyEditDatePart(selectedDate) : applyEditTimePart(selectedDate));
        },
      });
    } else {
      setIosPickerMode(mode);
    }
  };

  const handleIosPickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !iosPickerMode) {
      return;
    }
    setEditDateTime(
      iosPickerMode === 'date' ? applyEditDatePart(selectedDate) : applyEditTimePart(selectedDate),
    );
  };

  const closeIosPicker = () => setIosPickerMode(null);

  return {
    getDefaultFutureDate,
    openDateOrTimePicker,
    getEditBaseDate,
    handleIosPickerChange,
    closeIosPicker,
  };
}
