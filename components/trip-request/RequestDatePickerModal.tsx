import { Colors } from '@/constants/styles';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { FormModal } from '@/components/forms/FormLayout';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'iosPickerValue' | 'handleIosPickerChange' | 'insets' | 'iosPickerMode' | 'closeDatePicker' | 'confirmIosPicker'>;

type IOSDateTimePickerProps = React.ComponentProps<typeof DateTimePicker> & {
  accentColor?: string;
  display?: 'default' | 'compact' | 'inline' | 'spinner';
  locale?: string;
  minuteInterval?: number;
  textColor?: string;
  themeVariant?: 'dark' | 'light';
};
const IOSDateTimePicker = DateTimePicker as React.ComponentType<IOSDateTimePickerProps>;

export function RequestDatePickerModal({ iosPickerValue, handleIosPickerChange, insets, iosPickerMode, closeDatePicker, confirmIosPicker }: Props) {
  return (<FormModal inApp
    transparent
    animationType="slide"
    visible={Platform.OS === 'ios' && iosPickerMode !== null}
    presentationStyle="overFullScreen"
    onRequestClose={closeDatePicker}
  >
    {iosPickerMode ? (
      <View style={styles.iosOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={closeDatePicker}
          accessibilityRole="button"
          accessibilityLabel="Fermer le sélecteur"
        />
        <View style={styles.iosSheet}>
          <Text style={pickerStyles.title}>{iosPickerMode === 'date' ? 'Choisir la date' : 'Choisir l’heure'}</Text>
          <IOSDateTimePicker
            key={iosPickerMode}
            value={iosPickerValue}
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
          <View style={[pickerStyles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity accessibilityRole="button" style={pickerStyles.cancel} onPress={closeDatePicker}>
              <Text style={pickerStyles.cancelLabel}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={pickerStyles.confirm} onPress={confirmIosPicker}>
              <Text style={pickerStyles.confirmLabel}>Valider</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    ) : null}
  </FormModal>);
}

const pickerStyles = StyleSheet.create({
  title: { fontSize: 19, fontWeight: '700', color: Colors.gray[900], textAlign: 'center', paddingHorizontal: 16 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  cancel: { flex: 1, minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.gray[100] },
  confirm: { flex: 1, minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.primary },
  cancelLabel: { fontSize: 16, fontWeight: '600', color: Colors.gray[700] },
  confirmLabel: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
