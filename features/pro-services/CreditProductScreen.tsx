import React, { useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { ServiceLayout, ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { creditEquipment } from './assetCreditModel';
import { creditProductDetails, creditProductStatus } from './creditProductDetails';
import { SelectedCreditOffer } from './SelectedCreditOffer';
import { CreditHowItWorks } from './CreditHowItWorks';
import { CreditRequestComment } from './CreditRequestComment';
import { proError } from './model';
import { type AssetKind, useGetAssetCreditProductsQuery, useGetAssetCreditsQuery,
  useGetAssetCreditRequestsQuery, useRequestAssetCreditMutation } from '@/store/api/assetCreditApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useWalletScreenScope } from '@/hooks/wallet/useWalletScreenScope';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';

/** The route keys this screen by account/category: old replies cannot update another product. */
export function CreditProductScreen({ kind }: { kind: AssetKind }) {
  const largeText = useWindowDimensions().fontScale > 1.3;
  const active = useScreenIsActive(), enabled = useDisplayReadsEnabled(active);
  const user = useAppSelector(selectUser);
  const captureScope = useWalletScreenScope(user?.id, enabled);
  const products = useGetAssetCreditProductsQuery(undefined, displayReadOptions(enabled));
  const credits = useGetAssetCreditsQuery(undefined, displayReadOptions(enabled));
  const requests = useGetAssetCreditRequestsQuery(undefined, displayReadOptions(enabled));
  const [request, mutation] = useRequestAssetCreditMutation();
  const [notes, setNotes] = useState(''), [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const lock = useRef(false);
  const item = creditEquipment.find(item => item.kind === kind)!;
  const description = creditProductDetails[kind];
  const catalogue = products.currentData;
  const product = catalogue?.items.find(item => item.kind === kind);
  const pending = requests.currentData?.items.find(item => item.assetKind === kind && item.status === 'submitted');
  const quote = credits.currentData?.items.find(item => item.assetKind === kind && item.status === 'offered');
  const failed = products.isError || requests.isError || credits.isError;
  const canSend = enabled && !failed && !submitted && !!catalogue?.canRequest && !!requests.currentData && !!credits.currentData
    && product?.enabled === true && !product.comingSoon && !pending && !quote
    && (kind === 'phone' || (kind === 'vehicle' && product.eligibility?.eligible === true));
  const back = () => router.canGoBack() ? router.back() : router.replace('/services/credit');
  const submit = async () => {
    const current = captureScope();
    if (!current() || !canSend || lock.current) return;
    lock.current = true; setMessage('');
    try {
      await request({ assetKind: kind, notes: notes.trim() }).unwrap();
      if (current()) { setSubmitted(true); setNotes(''); setMessage('Votre choix est envoyé. Vous recevrez une offre avant de vous engager.'); }
    } catch (error) { if (current()) setMessage(proError(error)); }
    finally { lock.current = false; }
  };
  const future = !['phone', 'vehicle'].includes(kind) || product?.comingSoon;
  return <ServiceLayout title="Équipement" onBack={back} footer={submitted ?
    <ServiceButton title="Retour aux équipements" onPress={back} /> : quote ?
      <ServiceButton title="Voir mon offre et le contrat" disabled={!enabled || !!credits.isError}
        onPress={() => { if (enabled && !credits.isError) router.push(('/services/credit/' + quote.id) as Href); }} /> :
      !future && !pending ? <ServiceButton title="Envoyer mon choix" disabled={!canSend} busy={mutation.isLoading} onPress={submit} /> : undefined}>
    <View style={[s.row, { alignItems: 'flex-start', flexDirection: largeText ? 'column' : 'row' }]}>
      <View style={{ padding: 14, borderRadius: 16, backgroundColor: '#FFF1E8' }}>
        <Ionicons name={item.icon} size={32} color="#C34412" />
      </View>
      <View style={[largeText ? { width: '100%' } : s.flex, { gap: 4 }]}>
        <Text style={s.title}>{quote?.label || product?.label || item.label}</Text>
        <Text style={s.badge}>{quote ? 'Offre personnalisée reçue' : creditProductStatus(product, catalogue?.canRequest, !!pending)}</Text>
      </View>
    </View>
    <Text style={s.text}>{description.purpose}</Text>
    <View style={s.section}>
      <Text style={s.label}>Quel équipement recevrez-vous ?</Text>
      <Text style={s.text}>{description.toConfirm}</Text>
      <Text style={s.text}>Cette fiche présente une catégorie. Le modèle exact doit être précisé dans l’offre de Zwanga avant votre accord.</Text>
    </View>
    {products.isLoading && <ActivityIndicator accessibilityLabel="Vérification de la disponibilité" />}
    {failed && <View style={s.notice}>
      <Text accessibilityRole="alert" style={s.error}>Certaines informations ne sont pas à jour. Actualisez avant de continuer.</Text>
      <ServiceButton title="Réessayer" secondary disabled={!enabled} onPress={() => {
        if (enabled) { void products.refetch(); void requests.refetch(); void credits.refetch(); }
      }} />
    </View>}
    {kind === 'vehicle' && <View style={s.notice}>
      <Text style={s.label}>Conditions pour un véhicule</Text>
      <Text style={s.text}>Au moins 9 mois d’activité sur Zwanga, avec un trajet terminé avec passager tous les deux jours. Votre activité est vérifiée par Zwanga.</Text>
    </View>}
    {quote ? <SelectedCreditOffer id={quote.id} enabled={enabled} /> : <View style={s.section}>
      <Text style={s.label}>Prix et remboursement</Text>
      <Text style={s.text}>{future ? 'Ce service est à venir. Aucun prix ni échéancier n’est proposé actuellement.' :
        'Le prix, les frais éventuels, le total à rembourser, les mensualités et le pourcentage sur vos revenus seront indiqués dans votre offre.'}</Text>
      {!future && <Text style={s.text}>Vous choisirez parmi les formules proposées et lirez le contrat avant de donner votre accord. Envoyer votre choix ne crée aucun crédit ni prélèvement.</Text>}
    </View>}
    {!future && !pending && !quote && !submitted && <View style={{ gap: 8 }}>
      <Text style={s.label}>Votre besoin (facultatif)</Text>
      <TextInput style={s.input} accessibilityLabel="Précision sur le bien souhaité" placeholder={item.hint}
        value={notes} onChangeText={setNotes} maxLength={1000} multiline textAlignVertical="top" editable={!mutation.isLoading} />
    </View>}
    {!!message && <Text accessibilityRole="alert" style={s.text}>{message}</Text>}
    {pending && <CreditRequestComment request={pending} scope={`${user?.id}:${pending.id}`} enabled={enabled && !!user?.id && !requests.isError} />}
    {!future && <CreditHowItWorks assetKind={kind} />}
  </ServiceLayout>;
}
