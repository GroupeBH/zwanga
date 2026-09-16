import { DEFAULT_SUPPORT_EMAIL, type SupportContactPreference } from '@/components/support/supportData';
import { useDialog } from '@/components/ui/DialogProvider';
import React from 'react';
import { Linking } from 'react-native';
import type { SupportConfig } from '@/types';

interface Params {
  supportConfig: SupportConfig;
  persistFavoriteContact: (key: SupportContactPreference) => Promise<void>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  setShowTicketModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useSupportContactActions({
  supportConfig,
  persistFavoriteContact,
  showDialog,
  setShowTicketModal,
}: Params) {
  const handleOpenEmail = async () => {
    const email = supportConfig.contact.email || DEFAULT_SUPPORT_EMAIL;
    const url = `mailto:${email}?subject=${encodeURIComponent('Support ZWANGA')}`;
    await persistFavoriteContact('email');

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showDialog({
          variant: 'warning',
          title: 'Email indisponible',
          message: "Aucune application email n'est configurée sur cet appareil.",
        });
        return;
      }

      await Linking.openURL(url);
    } catch {
      showDialog({
        variant: 'danger',
        title: "Impossible d'ouvrir l'email",
        message: "Réessayez plus tard ou créez plutôt un ticket dans l'application.",
      });
    }
  };

  const handleOpenPhone = async () => {
    const phone = supportConfig.contact.phone?.trim();
    if (!phone) {
      showDialog({
        variant: 'warning',
        title: 'Numéro indisponible',
        message: "Le numéro du support n'est pas encore disponible pour le moment.",
      });
      return;
    }

    await persistFavoriteContact('phone');

    try {
      const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showDialog({
          variant: 'warning',
          title: 'Appel indisponible',
          message: 'Votre appareil ne permet pas de lancer un appel pour le moment.',
        });
        return;
      }

      await Linking.openURL(url);
    } catch {
      showDialog({
        variant: 'danger',
        title: "Impossible d'appeler",
        message: 'Réessayez plus tard ou utilisez plutôt le ticket ou WhatsApp.',
      });
    }
  };

  const handleOpenWhatsApp = async () => {
    const whatsapp = supportConfig.contact.whatsapp?.trim();
    const normalizedNumber = whatsapp?.replace(/\D/g, '');

    if (!normalizedNumber) {
      showDialog({
        variant: 'warning',
        title: 'WhatsApp indisponible',
        message: "Le contact WhatsApp du support n'est pas encore disponible.",
      });
      return;
    }

    await persistFavoriteContact('whatsapp');

    try {
      const text = encodeURIComponent("Bonjour, j'ai besoin d'aide sur ZWANGA.");
      const url = `https://wa.me/${normalizedNumber}?text=${text}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showDialog({
          variant: 'warning',
          title: 'WhatsApp indisponible',
          message: "WhatsApp n'est pas installé ou ne peut pas être ouvert sur cet appareil.",
        });
        return;
      }

      await Linking.openURL(url);
    } catch {
      showDialog({
        variant: 'danger',
        title: "Impossible d'ouvrir WhatsApp",
        message: "Réessayez plus tard ou utilisez plutôt le ticket ou l'email.",
      });
    }
  };

  const handleQuickAction = async (actionKey: SupportContactPreference) => {
    if (actionKey === 'ticket') {
      await persistFavoriteContact('ticket');
      setShowTicketModal(true);
      return;
    }

    if (actionKey === 'phone') {
      await handleOpenPhone();
      return;
    }

    if (actionKey === 'whatsapp') {
      await handleOpenWhatsApp();
      return;
    }

    await handleOpenEmail();
  };

  return {
    handleQuickAction,
  };
}
