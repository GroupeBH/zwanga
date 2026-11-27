import { buildPaymentPdfBase64 } from '../../features/payment-history/paymentReceipt';
import { sanitizeFileSegment, waitForNativePresentation } from '../../features/payment-history/paymentHistoryModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { useLazyGetPaymentDetailsQuery } from '@/store/api/paymentApi';
import type { PaymentHistoryItem } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAccountScreenScope } from '@/hooks/useAccountScreenScope';

interface Params {
  isDownloadingRef: React.RefObject<boolean>;
  setDownloadingPaymentId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedPayment: PaymentHistoryItem | null;
  getPaymentDetails: ReturnType<typeof useLazyGetPaymentDetailsQuery>[0];
  closeDetails: (onlyPaymentId?: string) => void;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
}

export function usePaymentReceiptDownload({
  isDownloadingRef,
  setDownloadingPaymentId,
  selectedPayment,
  getPaymentDetails,
  closeDetails,
  showDialog,
}: Params) {
  const captureScope = useAccountScreenScope();
  useEffect(() => { setDownloadingPaymentId(null); }, [captureScope, setDownloadingPaymentId]);
  const handleDownloadPayment = async (payment: PaymentHistoryItem) => {
    const isCurrent = captureScope();
    if (isDownloadingRef.current || !isCurrent()) {
      return;
    }

    isDownloadingRef.current = true;

    try {
      setDownloadingPaymentId(payment.id);
      const details =
        selectedPayment?.id === payment.id
          ? selectedPayment
          : await getPaymentDetails(payment.id).unwrap();
      if (!isCurrent()) return;
      if (details.id !== payment.id) throw new Error('Le reçu ne correspond pas au paiement choisi.');

      const shouldCloseDetailBeforeShare = selectedPayment?.id === details.id;
      if (shouldCloseDetailBeforeShare) {
        closeDetails(details.id);
        await waitForNativePresentation();
      }
      if (!isCurrent()) return;

      if (Platform.OS === 'web') {
        throw new Error('Pour télécharger ce reçu, utilisez l’application mobile.');
      }
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!isCurrent()) return;
      if (!sharingAvailable) {
        throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
      }

      const pdfBase64 = buildPaymentPdfBase64(details);
      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;

      if (!directory) {
        throw new Error('Stockage local indisponible');
      }

      const fileName = `zwanga-paiement-${sanitizeFileSegment(details.reference)}.pdf`;
      const fileUri = `${directory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!isCurrent()) return;
      // Expo Sharing attaches the file and grants read access on Android.
      // A content URI in Share.share({ message }) would only send plain text.
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Détail paiement ${details.reference}`,
      });
      if (!isCurrent()) return;
      showDialog({
        variant: 'success',
        title: 'Détail généré',
        message: `Le détail du paiement a été préparé.\n\nFichier: ${fileName}`,
      });
    } catch (error: any) {
      if (!isCurrent()) return;
      showDialog({
        variant: 'danger',
        title: 'Téléchargement impossible',
        message: getApiErrorMessage(
          error,
          'Impossible de générer le détail du paiement pour le moment.',
        ),
      });
    } finally {
      isDownloadingRef.current = false;
      if (isCurrent()) setDownloadingPaymentId(null);
    }
  };

  return {
    handleDownloadPayment,
  };
}
