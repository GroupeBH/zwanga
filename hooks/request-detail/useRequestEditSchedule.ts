import {
  EDIT_SCHEDULE_MIN_WINDOW_MS,
  isValidDate,
  getScheduleWindowDuration,
} from '../../features/request-detail/requestDetailModel';
import { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform } from 'react-native';

interface Params {
  editDepartureDateMin: Date | null;
  editDepartureDateMax: Date | null;
  setEditDepartureDateMin: React.Dispatch<React.SetStateAction<Date | null>>;
  setEditDepartureDateMax: React.Dispatch<React.SetStateAction<Date | null>>;
  setEditIosPickerModeMin: React.Dispatch<React.SetStateAction<"date" | "time" | null>>;
  setEditIosPickerModeMax: React.Dispatch<React.SetStateAction<"date" | "time" | null>>;
  editIosPickerModeMin: "date" | "time" | null;
  editIosPickerModeMax: "date" | "time" | null;
}

export function useRequestEditSchedule({
  editDepartureDateMin,
  editDepartureDateMax,
  setEditDepartureDateMin,
  setEditDepartureDateMax,
  setEditIosPickerModeMin,
  setEditIosPickerModeMax,
  editIosPickerModeMin,
  editIosPickerModeMax,
}: Params) {
  const applyDatePart = (date: Date, currentDate: Date) => {
    const next = new Date(currentDate);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    return next;
  };

  const applyTimePart = (date: Date, currentDate: Date) => {
    const next = new Date(currentDate);
    next.setHours(date.getHours());
    next.setMinutes(date.getMinutes());
    next.setSeconds(0);
    next.setMilliseconds(0);
    return next;
  };

  const updateEditDepartureDateMin = (newDate: Date) => {
    const previousWindowDuration = getScheduleWindowDuration(
      editDepartureDateMin,
      editDepartureDateMax,
    );
    setEditDepartureDateMin(newDate);
    setEditDepartureDateMax(
      new Date(newDate.getTime() + previousWindowDuration),
    );
  };

  const updateEditDepartureDateMax = (newDate: Date) => {
    if (
      isValidDate(editDepartureDateMin) &&
      newDate.getTime() <= editDepartureDateMin.getTime()
    ) {
      setEditDepartureDateMax(
        new Date(
          editDepartureDateMin.getTime() + EDIT_SCHEDULE_MIN_WINDOW_MS,
        ),
      );
      return;
    }

    setEditDepartureDateMax(newDate);
  };

  // Fonctions pour les date pickers du formulaire de modification
  const openEditDateOrTimePickerMin = (mode: 'date' | 'time') => {
    if (!editDepartureDateMin) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: editDepartureDateMin,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          const newDate = mode === 'date' 
            ? applyDatePart(selectedDate, editDepartureDateMin) 
            : applyTimePart(selectedDate, editDepartureDateMin);
          updateEditDepartureDateMin(newDate);
        },
      });
    } else {
      setEditIosPickerModeMin(mode);
    }
  };

  const openEditDateOrTimePickerMax = (mode: 'date' | 'time') => {
    if (!editDepartureDateMax) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: editDepartureDateMax,
        is24Hour: true,
        minimumDate: mode === 'date' && editDepartureDateMin ? editDepartureDateMin : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          const newDate = mode === 'date' 
            ? applyDatePart(selectedDate, editDepartureDateMax) 
            : applyTimePart(selectedDate, editDepartureDateMax);
          updateEditDepartureDateMax(newDate);
        },
      });
    } else {
      setEditIosPickerModeMax(mode);
    }
  };

  const handleEditIosPickerChangeMin = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !editIosPickerModeMin || !editDepartureDateMin) return;
    const newDate = editIosPickerModeMin === 'date' 
      ? applyDatePart(selectedDate, editDepartureDateMin) 
      : applyTimePart(selectedDate, editDepartureDateMin);
    updateEditDepartureDateMin(newDate);
    setEditIosPickerModeMin(null);
  };

  const handleEditIosPickerChangeMax = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !editIosPickerModeMax || !editDepartureDateMax) return;
    const newDate = editIosPickerModeMax === 'date' 
      ? applyDatePart(selectedDate, editDepartureDateMax) 
      : applyTimePart(selectedDate, editDepartureDateMax);
    updateEditDepartureDateMax(newDate);
    setEditIosPickerModeMax(null);
  };

  return {
    openEditDateOrTimePickerMin,
    openEditDateOrTimePickerMax,
    handleEditIosPickerChangeMin,
    handleEditIosPickerChangeMax,
  };
}
