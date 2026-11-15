import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useGetAssetCreditQuery } from '@/store/api/assetCreditApi';
import { ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { creditMoney } from './assetCreditModel';
import { CreditRepaymentSummary } from './CreditRepaymentSummary';
import { CreditCostPreview } from './CreditCostPreview';
import { CreditContractCosts } from './CreditContractCosts';
import { displayReadOptions } from '@/hooks/useDisplayReads';

/** Read the selected, personalized quote; never manufacture a price for an asset category. */
export function SelectedCreditOffer({ id, enabled }: { id: string; enabled: boolean }) {
  const query = useGetAssetCreditQuery(id, displayReadOptions(enabled));
  const credit = query.currentData?.id === id ? query.currentData : undefined;
  if (query.isError) return <View style={s.notice}>
    <Text style={s.error}>Impossible d’actualiser le coût de cette offre.</Text>
    <ServiceButton title="Actualiser l’offre" secondary disabled={!enabled} onPress={() => { if (enabled) void query.refetch(); }} />
  </View>;
  if (!credit) return <ActivityIndicator accessibilityLabel="Chargement du coût de l’offre" />;
  return <View style={s.section}>
    <Text style={s.label}>{credit.label}</Text>
    <Text style={s.text}>Total à rembourser pour ce bien</Text>
    <Text style={s.title}>{creditMoney(credit.principalMinor)}</Text>
    <CreditRepaymentSummary credit={credit} />
    <CreditCostPreview key={id} credit={credit} />
    <CreditContractCosts key={`cost:${id}`} credit={credit} />
    <Text style={s.text}>Vous pourrez lire le contrat et donner votre accord sur l’écran suivant.</Text>
  </View>;
}
