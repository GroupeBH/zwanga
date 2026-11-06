import React from 'react';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RequestDatePickerModal } from '@/components/trip-request/RequestDatePickerModal';

interface Props {
  iosPickerMode: 'date' | 'time' | null;
  closeIosPicker: () => void;
  iosPickerTarget: 'departure' | 'recurringEndDate';
  iosPickerValue: Date;
  departureDateTime: Date | null;
  handleIosPickerChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  confirmIosPicker: () => void;
}

export function PublishDateTimeModal({ iosPickerTarget, departureDateTime, closeIosPicker, ...picker }: Props) {
  const insets = useSafeAreaInsets();
  return <RequestDatePickerModal {...picker} insets={insets} closeDatePicker={closeIosPicker}
    title={iosPickerTarget === 'recurringEndDate' ? 'Date de fin' : undefined}
    minimumDate={iosPickerTarget === 'recurringEndDate' ? departureDateTime ?? new Date() : undefined} />;
}
