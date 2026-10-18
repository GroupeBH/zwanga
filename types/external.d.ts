declare module '@react-native-community/datetimepicker' {
  import * as React from 'react';
  import type { ViewProps } from 'react-native';

  export type DatePickerMode = 'date' | 'time' | 'datetime' | 'countdown';

  export type DateTimePickerEvent = {
    type: 'set' | 'dismissed';
    nativeEvent: {
      timestamp: number;
    };
  };

  export interface BasePickerProps extends ViewProps {
    value: Date;
    mode?: DatePickerMode;
    display?: 'default' | 'spinner' | 'compact' | 'inline' | 'calendar' | 'clock';
    is24Hour?: boolean;
    minuteInterval?: number;
    minimumDate?: Date;
    maximumDate?: Date;
    onChange: (event: DateTimePickerEvent, date?: Date) => void;
  }

  export interface DateTimePickerAndroidProps extends Omit<BasePickerProps, 'mode' | 'display'> {
    mode?: 'date' | 'time';
    onError?: (error: Error) => void;
  }

  export const DateTimePickerAndroid: {
    open: (options: DateTimePickerAndroidProps) => void;
    dismiss: (mode: 'date' | 'time') => Promise<boolean>;
  };

  export default class DateTimePicker extends React.Component<BasePickerProps> {}
}

