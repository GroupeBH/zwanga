import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ServiceLayout, ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { proError } from '@/features/pro-services/model';
import { creditEquipment, creditEquipmentLabel, creditMoney, creditStatus } from '@/features/pro-services/assetCreditModel';
import { type AssetKind, useGetAssetCreditProductsQuery, useGetAssetCreditsQuery,
  useGetAssetCreditRequestsQuery, useRequestAssetCreditMutation } from '@/store/api/assetCreditApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useWalletScreenScope } from '@/hooks/wallet/useWalletScreenScope';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { CreditRepaymentsLink } from '@/features/pro-services/CreditRepaymentsLink';
import { SelectedCreditOffer } from '@/features/pro-services/SelectedCreditOffer';

export default function CreditsScreen() {
  const active = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(active);
  const user = useAppSelector(selectUser);
  const captureScope = useWalletScreenScope(user?.id, enabled);
  const products = useGetAssetCreditProductsQuery(undefined, displayReadOptions(enabled));
  const credits = useGetAssetCreditsQuery(undefined, displayReadOptions(enabled));
  const requests = useGetAssetCreditRequestsQuery(undefined, displayReadOptions(enabled));
  const [request, state] = useRequestAssetCreditMutation();
  const [selected, setSelected] = useState<AssetKind | null>(null);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(false);
  const lock = useRef(false);
  useEffect(() => { setSelected(null); setNotes(''); setMessage(''); setDetails(false); }, [user?.id]);
  const catalogue = products.currentData;
  const pending = requests.currentData?.items.filter(item => item.status === 'submitted') ?? [];
  const selectedOffer = credits.currentData?.items.find(item => item.assetKind === selected && item.status === 'offered');
  const failed = products.isError || requests.isError;
  const canSend = enabled && !failed && !credits.isError && Boolean(credits.currentData)
    && catalogue?.canRequest === true && Boolean(requests.currentData)
    && catalogue.items.some(item => item.kind === selected && item.enabled)
    && !pending.some(item => item.assetKind === selected)
    && (selected !== 'equipment' || notes.trim().length >= 3);
  const submit = async () => {
    const current = captureScope();
    if (!current() || !canSend || !selected || selectedOffer || lock.current) return;
    lock.current = true;
    setMessage('');
    try {
      await request({ assetKind: selected, notes: notes.trim() }).unwrap();
      if (current()) { setSelected(null); setNotes(''); setMessage('Votre choix est envoyé. L’offre de Zwanga apparaîtra ici.'); }
    } catch (error) {
      if (current()) setMessage(proError(error));
    } finally { lock.current = false; }
  };
  return <ServiceLayout title="Acheter à crédit" footer={selectedOffer ? <ServiceButton
    title="Voir mon offre et le contrat" disabled={!enabled || Boolean(credits.isError)} onPress={() => {
      if (enabled && !credits.isError) router.push(('/services/credit/' + selectedOffer.id) as Href);
    }} /> : selected ? <ServiceButton title="Envoyer mon choix" disabled={!canSend} busy={state.isLoading} onPress={submit} /> : undefined}>
    <CreditRepaymentsLink active={active} />
    <Text style={s.text}>Choisissez un équipement ou un véhicule, sans engagement. Votre offre chiffrée vous permet de voir le coût et de simuler le remboursement avant d’accepter.</Text>
    <View>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: details }} style={[s.option, { minHeight: 44 }]}
        onPress={() => setDetails(value => !value)}>
        <Text style={[s.label, s.flex]}>Comment rembourser ?</Text>
        <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color="#A84318" />
      </TouchableOpacity>
      {details && <View style={s.notice}>
        <Text style={s.text}>{catalogue?.policyText || 'Les conditions de remboursement sont indiquées dans chaque offre.'}</Text>
        <Text style={s.text}>Vous pouvez aussi choisir un montant à rembourser depuis votre solde rechargé.
          {' '}Recharger seul ne rembourse pas le crédit. Aucun prélèvement avant votre accord et la remise du bien.</Text>
      </View>}
    </View>
    {products.isLoading && <ActivityIndicator accessibilityLabel="Chargement des offres à crédit" />}
    {(failed || credits.isError) && <View style={s.notice}>
      <Text accessibilityRole="alert" style={s.error}>Impossible d’actualiser le service. Vos contrats existants sont conservés.</Text>
      <ServiceButton title="Réessayer" secondary disabled={!enabled} onPress={() => {
        if (enabled) { void products.refetch(); void requests.refetch(); void credits.refetch(); }
      }} />
    </View>}
    {catalogue?.canRequest === false && <Text style={s.text}>L’acquisition à crédit est réservée aux conducteurs actifs.</Text>}
    <View accessibilityRole="radiogroup">
      {creditEquipment.map(item => {
        const quote = credits.currentData?.items.find(credit => credit.assetKind === item.kind && credit.status === 'offered');
        const available = catalogue?.items.some(product => product.kind === item.kind && product.enabled) === true;
        const waiting = pending.some(entry => entry.assetKind === item.kind);
        const disabled = !enabled || !available || !catalogue?.canRequest || waiting || state.isLoading;
        return <TouchableOpacity key={item.kind} style={[s.section, s.row]} accessibilityRole="radio"
          accessibilityLabel={item.label} accessibilityState={{ selected: selected === item.kind, disabled }} disabled={disabled}
          onPress={() => { if (!disabled) { setSelected(item.kind); setNotes(''); setMessage(''); } }}>
          <Ionicons name={item.icon} size={24} color={disabled ? '#647582' : '#C34412'} />
          <View style={s.flex}><Text style={s.label}>{item.label}</Text>
            {quote && <Text style={s.text}>Offre reçue · {creditMoney(quote.principalMinor)} au total</Text>}
            {waiting ? <Text style={s.badge}>Dossier en cours</Text> : !available &&
              <Text style={s.text}>{products.isLoading ? 'Vérification…' : 'Indisponible'}</Text>}</View>
          <Ionicons name={selected === item.kind ? 'radio-button-on' : 'radio-button-off'} size={22} color="#C34412" />
        </TouchableOpacity>;
      })}
    </View>
    {selectedOffer && <SelectedCreditOffer key={`${user?.id}:${selectedOffer.id}`} id={selectedOffer.id} enabled={enabled} />}
    {selected && !selectedOffer && <View style={{ gap: 8 }}>
      <Text style={s.text}>Prix et taux à préciser par Zwanga selon le bien. Aucun crédit n’est engagé par cet envoi.</Text>
      <Text style={s.label}>{creditEquipmentLabel(selected)} · {selected === 'equipment' ? 'Précisez votre besoin' : 'Précision facultative'}</Text>
      <TextInput style={s.input} accessibilityLabel="Précision sur le bien souhaité" placeholder={creditEquipment.find(item => item.kind === selected)?.hint}
        value={notes} onChangeText={setNotes} maxLength={1000} editable={!state.isLoading} />
    </View>}
    {!!message && <Text accessibilityRole="alert" style={s.text}>{message}</Text>}
    {!!credits.currentData?.items.length && <Text style={s.label}>Mes offres et crédits</Text>}
    {credits.currentData?.items.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" style={s.section}
      onPress={() => router.push(('/services/credit/' + item.id) as Href)}>
      <Text style={s.badge}>{creditStatus[item.status]}</Text><Text style={s.label}>{item.label}</Text>
      <Text style={s.text}>{item.status === 'offered' ? 'Montant proposé' : 'Reste à rembourser'} : {creditMoney(Number(item.principalMinor) - Number(item.paidMinor))}</Text>
      <Text style={s.eyebrow}>Voir le contrat et les remboursements →</Text>
    </TouchableOpacity>)}
  </ServiceLayout>;
}
