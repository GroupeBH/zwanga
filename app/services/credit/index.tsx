import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ServiceLayout, ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { creditEquipment, creditMoney, creditStatus } from '@/features/pro-services/assetCreditModel';
import { creditProductStatus } from '@/features/pro-services/creditProductDetails';
import { useGetAssetCreditProductsQuery, useGetAssetCreditsQuery, useGetAssetCreditRequestsQuery } from '@/store/api/assetCreditApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { CreditRepaymentsLink } from '@/features/pro-services/CreditRepaymentsLink';

export default function CreditsScreen() {
  const active = useScreenIsActive(), enabled = useDisplayReadsEnabled(active);
  const products = useGetAssetCreditProductsQuery(undefined, displayReadOptions(enabled));
  const credits = useGetAssetCreditsQuery(undefined, displayReadOptions(enabled));
  const requests = useGetAssetCreditRequestsQuery(undefined, displayReadOptions(enabled));
  const catalogue = products.currentData;
  const pending = requests.currentData?.items.filter(item => item.status === 'submitted') ?? [];
  const failed = products.isError || requests.isError || credits.isError;
  const go = (path: string) => { if (active) router.push(path as Href); };
  return <ServiceLayout title="Acheter à crédit">
    <CreditRepaymentsLink active={active} />
    <Text style={s.text}>Ouvrez un équipement pour découvrir son usage et les conditions avant d’envoyer votre choix.</Text>
    {products.isLoading && <ActivityIndicator accessibilityLabel="Chargement des équipements" />}
    {failed && <View style={s.notice}>
      <Text accessibilityRole="alert" style={s.error}>Impossible d’actualiser le service. Vos contrats existants sont conservés.</Text>
      <ServiceButton title="Réessayer" secondary disabled={!enabled} onPress={() => {
        if (enabled) { void products.refetch(); void requests.refetch(); void credits.refetch(); }
      }} />
    </View>}
    {creditEquipment.map(item => {
      const quote = credits.currentData?.items.find(credit => credit.assetKind === item.kind && credit.status === 'offered');
      const product = catalogue?.items.find(product => product.kind === item.kind);
      const future = !['phone', 'vehicle'].includes(item.kind);
      return <TouchableOpacity key={item.kind} style={[s.section, s.row]} accessibilityRole="button"
        accessibilityLabel={item.label} accessibilityHint="Ouvrir la fiche et les conditions de cet équipement"
        disabled={!active} onPress={() => go('/services/credit/product/' + item.kind)}>
        <Ionicons name={item.icon} size={26} color="#C34412" />
        <View style={s.flex}>
          <Text style={s.label}>{item.label}</Text>
          <Text style={s.text}>{quote ? 'Offre reçue · ' + creditMoney(quote.principalMinor) + ' au total' :
            future ? 'À venir' : creditProductStatus(product, catalogue?.canRequest,
              pending.some(entry => entry.assetKind === item.kind))}</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#647582" />
      </TouchableOpacity>;
    })}
    {!!credits.currentData?.items.length && <Text style={s.label}>Mes offres et crédits</Text>}
    {credits.currentData?.items.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" style={s.section}
      disabled={!active} onPress={() => go('/services/credit/' + item.id)}>
      <Text style={s.badge}>{creditStatus[item.status]}</Text><Text style={s.label}>{item.label}</Text>
      <Text style={s.text}>{item.status === 'offered' ? 'Montant proposé' : 'Reste à rembourser'} : {creditMoney(Number(item.principalMinor) - Number(item.paidMinor))}</Text>
      <Text style={s.eyebrow}>Voir le contrat et les remboursements →</Text>
    </TouchableOpacity>)}
  </ServiceLayout>;
}
