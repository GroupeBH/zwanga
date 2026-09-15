import { buildPaymentPdfBase64 } from '../../features/payment-history/paymentReceipt';
import { sanitizeFileSegment, waitForNativePresentation } from '../../features/payment-history/paymentHistoryModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { useLazyGetPaymentDetailsQuery } from '@/store/api/paymentApi';
import type { PaymentHistoryItem } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import * as FileSystem from 'expo-file-system/legacy';
import React from 'react';
import { Platform, Share } from 'react-native';

interface Params {
  isDownloadingRef: React.RefObject<boolean>;
  setDownloadingPaymentId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedPayment: PaymentHistoryItem | null;
  getPaymentDetails: ReturnType<typeof useLazyGetPaymentDetailsQuery>[0];
  setSelectedPayment: React.Dispatch<React.SetStateAction<PaymentHistoryItem | null>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
}

export function usePaymentReceiptDownload({
  isDownloadingRef,
  setDownloadingPaymentId,
  selectedPayment,
  getPaymentDetails,
  setSelectedPayment,
  showDialog,
}: Params) {
  const handleDownloadPayment = async (payment: PaymentHistoryItem) => {
    if (isDownloadingRef.current) {
      return;
    }

    isDownloadingRef.current = true;

    try {
      setDownloadingPaymentId(payment.id);
      const details =
        selectedPayment?.id === payment.id
          ? selectedPayment
          : await getPaymentDetails(payment.id).unwrap();

      const shouldCloseDetailBeforeShare = selectedPayment?.id === details.id;
      if (shouldCloseDetailBeforeShare) {
        setSelectedPayment(null);
        await waitForNativePresentation();
      }

      const pdfBase64 = buildPaymentPdfBase64(details);
      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;

      if (!directory) {
        throw new Error('Stockage local indisponible');
      }

      const fileName = `zwanga-paiement-${sanitizeFileSegment(details.reference)}.pdf`;
      const fileUri = `${directory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType?.Base64 || ('base64' as any),
      });
      let sharedUri = fileUri;

      if (Platform.OS === 'android' && FileSystem.getContentUriAsync) {
        try {
          sharedUri = await FileSystem.getContentUriAsync(fileUri);
        } catch (error) {
          console.warn('[PaymentHistory] Failed to create Android content URI:', error);
        }
      }

      await Share.share({
        title: `Détail paiement ${details.reference}`,
        message:
          Platform.OS === 'android'
            ? `Détail du paiement ${details.reference}\n${sharedUri}`
            : `Détail du paiement ${details.reference}`,
        url: Platform.OS === 'ios' ? sharedUri : undefined,
      });
      if (!shouldCloseDetailBeforeShare && selectedPayment?.id === details.id) {
        setSelectedPayment(details);
      }

      showDialog({
        variant: 'success',
        title: 'Détail généré',
        message: `Le détail du paiement a été préparé.\n\nFichier: ${fileName}`,
      });
    } catch (error: any) {
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
      setDownloadingPaymentId(null);
    }
  };

  return {
    handleDownloadPayment,
  };
}
