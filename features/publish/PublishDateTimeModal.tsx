import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { IOSDateTimePicker } from './publishModel';
import { styles } from '../screen-styles/app/publish/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PublishDateTimeModalProps {
  iosPickerMode: "date" | "time" | null;
  closeIosPicker: () => void;
  iosPickerTarget: "departure" | "recurringEndDate";
  iosPickerValue: Date;
  departureDateTime: Date | null;
  handleIosPickerChange: (_event: DateTimePickerEvent, selectedDate?: Date) => void;
  confirmIosPicker: () => void;
}

export function PublishDateTimeModal({
  iosPickerMode,
  closeIosPicker,
  iosPickerTarget,
  iosPickerValue,
  departureDateTime,
  handleIosPickerChange,
  confirmIosPicker,
}: PublishDateTimeModalProps) {
  return (
    <Modal
      visible={Platform.OS === 'ios' && iosPickerMode !== null}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={closeIosPicker}
    >
      <View style={styles.dateTimeModalOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={closeIosPicker}
          accessibilityLabel="Fermer le sélecteur"
        />
        <View style={styles.dateTimeModalCard}>
          <View style={styles.dateTimeModalHeader}>
            <View style={styles.dateTimeModalIcon}>
              <Ionicons
                name={iosPickerMode === 'time' ? 'time' : 'calendar'}
                size={22}
                color={Colors.primary}
              />
            </View>
            <View style={styles.dateTimeModalHeaderText}>
              <Text style={styles.dateTimeModalTitle}>
                {iosPickerTarget === 'recurringEndDate'
                  ? 'Date de fin'
                  : iosPickerMode === 'time'
                    ? 'Heure de départ'
                    : 'Date de départ'}
              </Text>
              <Text style={styles.dateTimeModalSubtitle}>
                {iosPickerMode === 'time'
                  ? 'Choisissez une heure précise'
                  : 'Choisissez une date dans le calendrier'}
              </Text>
            </View>
          </View>

          {iosPickerMode && (
            <IOSDateTimePicker
              key={`${iosPickerTarget}-${iosPickerMode}`}
              value={iosPickerValue}
              mode={iosPickerMode}
              display="spinner"
              locale="fr-FR"
              themeVariant="light"
              accentColor={Colors.primary}
              textColor={Colors.gray[900]}
              minuteInterval={5}
              minimumDate={
                iosPickerMode === 'date'
                  ? iosPickerTarget === 'recurringEndDate'
                    ? departureDateTime ?? new Date()
                    : new Date()
                  : undefined
              }
              onChange={handleIosPickerChange}
              style={styles.dateTimeModalPicker}
            />
          )}

          <View style={styles.dateTimeModalActions}>
            <TouchableOpacity
              style={[styles.dateTimeModalButton, styles.dateTimeModalCancelButton]}
              onPress={closeIosPicker}
            >
              <Text style={styles.dateTimeModalCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateTimeModalButton, styles.dateTimeModalConfirmButton]}
              onPress={confirmIosPicker}
            >
              <Text style={styles.dateTimeModalConfirmText}>Confirmer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
