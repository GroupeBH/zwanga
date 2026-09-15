import { parseErrorMessage } from '../../features/security/securityErrors';
import { useDialog } from '@/components/ui/DialogProvider';
import { useGetBookingByIdQuery, useSetBookingEmergencyContactsMutation } from '@/store/api/bookingApi';
import { useCreateEmergencyContactMutation, useGetEmergencyContactsQuery } from '@/store/api/safetyApi';
import { useGetTripByIdQuery, useSetDriverEmergencyContactsMutation } from '@/store/api/tripApi';
import React from 'react';
import type { Booking } from '@/types';

interface Params {
  newContactName: string;
  newContactPhone: string;
  newContactRelationship: string;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  createEmergencyContact: ReturnType<typeof useCreateEmergencyContactMutation>[0];
  refetchContacts: ReturnType<typeof useGetEmergencyContactsQuery>['refetch'];
  setSelectedContactIds: React.Dispatch<React.SetStateAction<string[]>>;
  setContactFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  resetContactForm: () => void;
  selectedContactIds: string[];
  role: "driver" | "passenger";
  setDriverEmergencyContacts: ReturnType<typeof useSetDriverEmergencyContactsMutation>[0];
  tripId: string;
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  setSavedDriverSelectionOverride: React.Dispatch<React.SetStateAction<string[] | null>>;
  bookingId: string | undefined;
  booking: Booking | undefined;
  setBookingEmergencyContacts: ReturnType<typeof useSetBookingEmergencyContactsMutation>[0];
  refetchBooking: ReturnType<typeof useGetBookingByIdQuery>['refetch'];
  setSelectorVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useTripSecurityActions({
  newContactName,
  newContactPhone,
  newContactRelationship,
  showDialog,
  createEmergencyContact,
  refetchContacts,
  setSelectedContactIds,
  setContactFormVisible,
  resetContactForm,
  selectedContactIds,
  role,
  setDriverEmergencyContacts,
  tripId,
  refetchTrip,
  setSavedDriverSelectionOverride,
  bookingId,
  booking,
  setBookingEmergencyContacts,
  refetchBooking,
  setSelectorVisible,
}: Params) {
  const handleCreateContact = async () => {
    const name = newContactName.trim();
    const phone = newContactPhone.trim();
    const relationship = newContactRelationship.trim();
    const phoneDigits = phone.replace(/\D/g, '');

    if (!name) {
      showDialog({
        variant: 'warning',
        title: 'Nom manquant',
        message: 'Ajoutez le nom du proche à prévenir.',
      });
      return;
    }

    if (phoneDigits.length < 6) {
      showDialog({
        variant: 'warning',
        title: 'Téléphone invalide',
        message: 'Ajoutez un numéro de téléphone valide pour ce proche.',
      });
      return;
    }

    try {
      const createdContact = await createEmergencyContact({
        name,
        phone,
        relationship: relationship || undefined,
      }).unwrap();

      await refetchContacts();
      setSelectedContactIds((current) =>
        current.includes(createdContact.id) ? current : [...current, createdContact.id],
      );
      setContactFormVisible(false);
      resetContactForm();
      showDialog({
        variant: 'success',
        title: 'Proche ajouté',
        message: 'Il est déjà coché pour ce trajet.',
      });
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: "Impossible d'ajouter ce proche",
        message: parseErrorMessage(error, 'Vérifiez les informations puis réessayez.'),
      });
    }
  };

  const handleSaveSelection = async () => {
    if (selectedContactIds.length === 0) {
      showDialog({
        variant: 'warning',
        title: 'Choisissez un proche',
        message: 'Sélectionnez au moins une personne à prévenir.',
      });
      return;
    }

    try {
      if (role === 'driver') {
        await setDriverEmergencyContacts({
          tripId,
          emergencyContactIds: selectedContactIds,
        }).unwrap();

        await refetchTrip();
        setSavedDriverSelectionOverride(selectedContactIds);
        showDialog({
          variant: 'success',
          title: 'Proches enregistrés',
          message: 'Ils seront prévenus automatiquement pendant ce trajet.',
        });
      } else {
        if (!bookingId || !booking || booking.status !== 'accepted') {
          showDialog({
            variant: 'info',
            title: 'Réservation pas encore prête',
            message: 'Vous pourrez choisir vos proches après acceptation.',
          });
          return;
        }

        await setBookingEmergencyContacts({
          bookingId,
          emergencyContactIds: selectedContactIds,
        }).unwrap();

        await refetchBooking();
        showDialog({
          variant: 'success',
          title: 'Proches enregistrés',
          message: 'Ils seront prévenus automatiquement pendant ce trajet.',
        });
      }

      setSelectorVisible(false);
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: "Impossible d'enregistrer",
        message: parseErrorMessage(error, 'Une erreur est survenue.'),
      });
    }
  };

  return {
    handleCreateContact,
    handleSaveSelection,
  };
}
