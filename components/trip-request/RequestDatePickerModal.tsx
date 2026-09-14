import { Colors } from '@/constants/styles';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'departureDateMin' | 'handleIosPickerChange' | 'insets' | 'iosPickerMode' | 'setIosPickerMode'>;

type IOSDateTimePickerProps = React.ComponentProps<typeof DateTimePicker> & {
  accentColor?: string;
  display?: 'default' | 'compact' | 'inline' | 'spinner';
  locale?: string;
  minuteInterval?: number;
  textColor?: string;
  themeVariant?: 'dark' | 'light';
};
const IOSDateTimePicker = DateTimePicker as React.ComponentType<IOSDateTimePickerProps>;

export function RequestDatePickerModal({ departureDateMin, handleIosPickerChange, insets, iosPickerMode, setIosPickerMode }: Props) {
  return (<Modal
    transparent
    animationType="slide"
    visible={Platform.OS === 'ios' && iosPickerMode !== null}
    presentationStyle="overFullScreen"
    onRequestClose={() => setIosPickerMode(null)}
  >
    {iosPickerMode ? (
      <View style={styles.iosOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={() => setIosPickerMode(null)}
          accessibilityLabel="Fermer le sélecteur"
        />
        <View style={styles.iosSheet}>
          <IOSDateTimePicker
            key={iosPickerMode}
            value={departureDateMin}
            mode={iosPickerMode}
            display="spinner"
            locale="fr-FR"
            themeVariant="light"
            accentColor={Colors.primary}
            textColor={Colors.gray[900]}
            minuteInterval={5}
            minimumDate={iosPickerMode === 'date' ? new Date() : undefined}
            onChange={handleIosPickerChange}
            style={styles.iosPicker}
          />
          <TouchableOpacity
            style={[styles.iosDone, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
            onPress={() => setIosPickerMode(null)}
          >
            <Text style={styles.iosDoneText}>Terminer</Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : null}
  </Modal>);
}
