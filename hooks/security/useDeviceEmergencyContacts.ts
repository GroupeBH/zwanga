import { useDialog } from '@/components/ui/DialogProvider';
import React from 'react';
import { Linking } from 'react-native';
import * as Contacts from 'expo-contacts';

interface Params {
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  setFormData: React.Dispatch<React.SetStateAction<{ name: string; phone: string; relationship: string; }>>;
  formData: { name: string; phone: string; relationship: string; };
}

export function useDeviceEmergencyContacts({
  showDialog,
  setFormData,
  formData,
}: Params) {
  const requestContactsPermission = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
      return false;
    }
  };

  const pickFromContacts = async () => {
    try {
      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        showDialog({
          title: 'Permission requise',
          message: 'Veuillez autoriser l\'accès aux contacts pour sélectionner un contact',
          variant: 'danger',
          actions: [
            {
              label: 'Paramètres',
              variant: 'primary',
              onPress: () => Linking.openSettings(),
            },
            {
              label: 'Annuler',
              variant: 'secondary',
              onPress: () => {},
            },
          ],
        });
        return;
      }

      const pickedContact = await Contacts.presentContactPickerAsync();
      if (pickedContact && pickedContact.phoneNumbers && pickedContact.phoneNumbers.length > 0) {
        const phoneNumber = pickedContact.phoneNumbers[0]?.number?.replace(/\s/g, '') ?? '';
        if (!phoneNumber) return;
        setFormData({
          name: pickedContact.name || '',
          phone: phoneNumber,
          relationship: formData.relationship,
        });
      }
    } catch (error) {
      console.error('Error picking contact:', error);
    }
  };

  return {
    pickFromContacts,
  };
}
