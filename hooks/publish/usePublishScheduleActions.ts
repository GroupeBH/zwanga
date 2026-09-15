import { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { Keyboard, Platform } from 'react-native';

interface Params {
  departureDateTime: Date | null;
  recurringEndDate: Date | null;
  setRecurringEndDate: React.Dispatch<React.SetStateAction<Date | null>>;
  setDepartureDateTime: React.Dispatch<React.SetStateAction<Date | null>>;
  setIosPickerValue: React.Dispatch<React.SetStateAction<Date>>;
  setIosPickerTarget: React.Dispatch<React.SetStateAction<"departure" | "recurringEndDate">>;
  setIosPickerMode: React.Dispatch<React.SetStateAction<"date" | "time" | null>>;
  iosPickerMode: "date" | "time" | null;
  iosPickerTarget: "departure" | "recurringEndDate";
  iosPickerValue: Date;
}

export function usePublishScheduleActions({
  departureDateTime,
  recurringEndDate,
  setRecurringEndDate,
  setDepartureDateTime,
  setIosPickerValue,
  setIosPickerTarget,
  setIosPickerMode,
  iosPickerMode,
  iosPickerTarget,
  iosPickerValue,
}: Params) {
  const getBaseDateTime = () => {
    if (departureDateTime) {
      return new Date(departureDateTime);
    }
    const base = new Date();
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
    return base;
  };

  const applyDatePart = (pickedDate: Date) => {
    const base = getBaseDateTime();
    const next = new Date(base);
    next.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
    return next;
  };

  const applyTimePart = (pickedDate: Date) => {
    const base = getBaseDateTime();
    const next = new Date(base);
    next.setHours(pickedDate.getHours(), pickedDate.getMinutes(), 0, 0);
    return next;
  };

  const openDateOrTimePicker = (
    mode: 'date' | 'time',
    target: 'departure' | 'recurringEndDate' = 'departure',
  ) => {
    Keyboard.dismiss();
    if (Platform.OS === 'android') {
      const value =
        target === 'recurringEndDate'
          ? recurringEndDate ?? departureDateTime ?? getBaseDateTime()
          : getBaseDateTime();
      DateTimePickerAndroid.open({
        mode,
        value,
        is24Hour: true,
        minimumDate:
          mode === 'date'
            ? target === 'recurringEndDate'
              ? departureDateTime ?? new Date()
              : new Date()
            : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) {
            return;
          }

          if (target === 'recurringEndDate') {
            const nextEndDate = new Date(selectedDate);
            nextEndDate.setHours(0, 0, 0, 0);
            setRecurringEndDate(nextEndDate);
            return;
          }

          setDepartureDateTime(
            mode === 'date' ? applyDatePart(selectedDate) : applyTimePart(selectedDate),
          );
        },
      });
    } else {
      const value =
        target === 'recurringEndDate'
          ? recurringEndDate ?? departureDateTime ?? getBaseDateTime()
          : getBaseDateTime();
      setIosPickerValue(new Date(value));
      setIosPickerTarget(target);
      setIosPickerMode(mode);
    }
  };

  const handleIosPickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate) {
      return;
    }
    setIosPickerValue(selectedDate);
  };

  const confirmIosPicker = () => {
    if (!iosPickerMode) {
      return;
    }
    if (iosPickerTarget === 'recurringEndDate') {
      const nextEndDate = new Date(iosPickerValue);
      nextEndDate.setHours(0, 0, 0, 0);
      setRecurringEndDate(nextEndDate);
    } else {
      setDepartureDateTime(
        iosPickerMode === 'date' ? applyDatePart(iosPickerValue) : applyTimePart(iosPickerValue),
      );
    }
    closeIosPicker();
  };

  const closeIosPicker = () => {
    setIosPickerMode(null);
    setIosPickerTarget('departure');
  };

  return {
    openDateOrTimePicker,
    closeIosPicker,
    handleIosPickerChange,
    confirmIosPicker,
  };
}
