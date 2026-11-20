import React from 'react';
import { Text, View } from 'react-native';
import { s } from '@/features/pro-services/ServiceLayout';
import type { AssetKind } from '@/store/api/assetCreditApi';

/** Explanatory copy only: the offered contract remains the source of financial terms. */
export function CreditHowItWorks({ assetKind = 'phone' }: { assetKind?: AssetKind } = {}) {
  return <View style={s.notice}>
    <Text style={s.label}>Comment rembourser {assetKind === 'phone' ? 'le téléphone' : 'le bien'} ?</Text>
    <Text style={s.text}>1. Décrivez votre besoin. L’envoi ne vous engage pas.</Text>
    <Text style={s.text}>2. Comparez les mensualités de votre offre et lisez le contrat : prix, frais, total et pourcentage.</Text>
    <Text style={s.text}>3. Après votre accord et la remise du bien, une part de vos revenus rembourse le crédit. Pour un trajet cash, elle est prise sur votre solde rechargé ; le manque reste dû.</Text>
    <Text style={s.text}>Vous pouvez aussi rembourser le montant de votre choix depuis votre solde. Recharger seul ne rembourse pas le crédit.</Text>
    <Text style={s.text}>Les remboursements par trajet comptent dans vos mensualités : vous complétez seulement le manque. La commission Zwanga reste séparée.</Text>
  </View>;
}
