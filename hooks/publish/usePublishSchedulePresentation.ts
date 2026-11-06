import React, { useMemo } from 'react';
import { formatRequestDayLabel, formatTimeLabel } from '@/features/trip-request/requestFormModel';

interface Params {
  departureDateTime: Date | null;
  hasChosenDepartureTime: boolean;
  recurringEndDate: Date | null;
  recurringWeekdayOptions: { value: number; label: string; }[];
  recurringWeekdays: number[];
  isPublishing: boolean;
  isPublishingRecurring: boolean;
  setIsRecurringTrip: React.Dispatch<React.SetStateAction<boolean>>;
  setRecurringWeekdays: React.Dispatch<React.SetStateAction<number[]>>;
  toIsoWeekday: (date: Date) => number;
  setRecurringEndDate: React.Dispatch<React.SetStateAction<Date | null>>;
}

export function usePublishSchedulePresentation({
  departureDateTime,
  hasChosenDepartureTime,
  recurringEndDate,
  recurringWeekdayOptions,
  recurringWeekdays,
  isPublishing,
  isPublishingRecurring,
  setIsRecurringTrip,
  setRecurringWeekdays,
  toIsoWeekday,
  setRecurringEndDate,
}: Params) {
  const formatCoordinatePair = (latitude?: number, longitude?: number) => {
    if (
      typeof latitude !== 'number' ||
      Number.isNaN(latitude) ||
      typeof longitude !== 'number' ||
      Number.isNaN(longitude)
    ) {
      return null;
    }
    return `${latitude.toFixed(5)} / ${longitude.toFixed(5)}`;
  };

  const formattedDateLabel = useMemo(() => {
    return formatRequestDayLabel(departureDateTime ?? new Date());
  }, [departureDateTime]);

  const formattedTimeLabel = useMemo(() => {
    return !departureDateTime || !hasChosenDepartureTime ? 'Choisir l’heure' : formatTimeLabel(departureDateTime);
  }, [departureDateTime, hasChosenDepartureTime]);

  const formattedFullDateTime = useMemo(() => {
    if (!departureDateTime) {
      return 'Non défini';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(departureDateTime);
  }, [departureDateTime]);
  const formattedRecurringEndDate = useMemo(() => {
    if (!recurringEndDate) {
      return 'Aucune date de fin';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(recurringEndDate);
  }, [recurringEndDate]);

  const recurringDaysSummary = useMemo(() => {
    return recurringWeekdayOptions
      .filter((option) => recurringWeekdays.includes(option.value))
      .map((option) => option.label)
      .join(', ');
  }, [recurringWeekdayOptions, recurringWeekdays]);

  const isSubmittingTrip = isPublishing || isPublishingRecurring;
  const toggleRecurringTrip = () => {
    setIsRecurringTrip((current) => {
      const next = !current;
      if (next && recurringWeekdays.length === 0) {
        setRecurringWeekdays([toIsoWeekday(departureDateTime ?? new Date())]);
      }
      if (!next) {
        setRecurringEndDate(null);
      }
      return next;
    });
  };

  const toggleRecurringWeekday = (weekday: number) => {
    setRecurringWeekdays((current) => {
      if (current.includes(weekday)) {
        return current.filter((value) => value !== weekday);
      }
      return [...current, weekday].sort((left, right) => left - right);
    });
  };

  return {
    isSubmittingTrip,
    formattedDateLabel,
    formattedTimeLabel,
    toggleRecurringTrip,
    toggleRecurringWeekday,
    recurringDaysSummary,
    formattedRecurringEndDate,
    formatCoordinatePair,
    formattedFullDateTime,
  };
}
