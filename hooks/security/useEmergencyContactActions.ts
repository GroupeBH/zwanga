import { MAX_CONTACTS } from '../../features/security/emergencyContactsModel';
import { useDialog } from '@/components/ui/DialogProvider';
import React from 'react';
import {
  useGetEmergencyContactsQuery,
  useCreateEmergencyContactMutation,
  useUpdateEmergencyContactMutation,
  useDeleteEmergencyContactMutation,
} from '@/store/api/safetyApi';
import type { EmergencyContact } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';

interface Params {
  setFormData: React.Dispatch<React.SetStateAction<{ name: string; phone: string; relationship: string; }>>;
  setEditingContact: React.Dispatch<React.SetStateAction<EmergencyContact | null>>;
  formData: { name: string; phone: string; relationship: string; };
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  contacts: EmergencyContact[];
  createContact: ReturnType<typeof useCreateEmergencyContactMutation>[0];
  setShowAddModal: React.Dispatch<React.SetStateAction<boolean>>;
  refetch: ReturnType<typeof useGetEmergencyContactsQuery>['refetch'];
  editingContact: EmergencyContact | null;
  updateContact: ReturnType<typeof useUpdateEmergencyContactMutation>[0];
  deleteContact: ReturnType<typeof useDeleteEmergencyContactMutation>[0];
}

export function useEmergencyContactActions({
  setFormData,
  setEditingContact,
  formData,
  showDialog,
  contacts,
  createContact,
  setShowAddModal,
  refetch,
  editingContact,
  updateContact,
  deleteContact,
}: Params) {
  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      relationship: '',
    });
    setEditingContact(null);
  };

  const handleAddContact = async () => {
    if (!formData.name.trim() || !formData.phone.trim()) {
      showDialog({
        title: 'Champs requis',
        message: 'Veuillez remplir le nom et le numéro de téléphone',
        variant: 'danger',
      });
      return;
    }

    if (contacts.length >= MAX_CONTACTS) {
      showDialog({
        title: 'Limite atteinte',
        message: `Vous ne pouvez ajouter que ${MAX_CONTACTS} contacts d'urgence maximum`,
        variant: 'danger',
      });
      return;
    }

    try {
      await createContact({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        relationship: formData.relationship.trim() || undefined,
      }).unwrap();

      showDialog({
        title: 'Succès',
        message: 'Contact d\'urgence ajouté avec succès',
        variant: 'success',
      });
      resetForm();
      setShowAddModal(false);
      refetch();
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible d\'ajouter le contact.'),
        variant: 'danger',
      });
    }
  };

  const handleEditContact = async () => {
    if (!editingContact || !formData.name.trim() || !formData.phone.trim()) {
      showDialog({
        title: 'Champs requis',
        message: 'Veuillez remplir le nom et le numéro de téléphone',
        variant: 'danger',
      });
      return;
    }

    try {
      await updateContact({
        id: editingContact.id,
        payload: {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          relationship: formData.relationship.trim() || undefined,
        },
      }).unwrap();

      showDialog({
        title: 'Succès',
        message: 'Contact d\'urgence mis à jour avec succès',
        variant: 'success',
      });
      resetForm();
      setEditingContact(null);
      setShowAddModal(false);
      refetch();
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible de mettre à jour le contact.'),
        variant: 'danger',
      });
    }
  };

  const handleDeleteContact = (contactId: string) => {
    showDialog({
      title: 'Supprimer le contact',
      message: 'Êtes-vous sûr de vouloir supprimer ce contact d\'urgence ?',
      variant: 'danger',
      actions: [
        {
          label: 'Supprimer',
          variant: 'primary',
          onPress: async () => {
            try {
              await deleteContact(contactId).unwrap();
              showDialog({
                title: 'Succès',
                message: 'Contact d\'urgence supprimé avec succès',
                variant: 'success',
              });
              refetch();
            } catch (error: any) {
              showDialog({
                title: 'Erreur',
                message: getApiErrorMessage(error, 'Impossible de supprimer le contact.'),
                variant: 'danger',
              });
            }
          },
        },
        {
          label: 'Annuler',
          variant: 'secondary',
          onPress: () => {},
        },
      ],
    });
  };

  const openEditModal = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship || '',
    });
    setShowAddModal(true);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  return {
    openAddModal,
    openEditModal,
    handleDeleteContact,
    resetForm,
    handleEditContact,
    handleAddContact,
  };
}
