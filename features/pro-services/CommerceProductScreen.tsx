import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { router, type Href } from 'expo-router';
import { ServiceLayout, ServiceButton, s } from './ServiceLayout';
import { commerceMoney } from './commerceModel';
import { proError } from './model';
import { useCommerceProductQuery, useCommerceQuoteQuery, useCommerceApplyMutation, useCommerceUploadMutation } from '@/store/api/commerceApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { useGetMyProCasesQuery } from '@/store/api/proServicesApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useWalletScreenScope } from '@/hooks/wallet/useWalletScreenScope';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';

export function CommerceProductScreen({ id }: { id: string }) {
  const user = useAppSelector(selectUser), enabled = useDisplayReadsEnabled(useScreenIsActive());
  const scope = useWalletScreenScope(user?.id, enabled);
  const product = useCommerceProductQuery(id, displayReadOptions(enabled));
  const p = product.currentData;
  const [mode, setMode] = useState<'cash' | 'credit'>('cash'), [planId, setPlan] = useState('');
  const selectedPlan = planId || p?.prices.plans[0]?.id;
  const quote = useCommerceQuoteQuery({ id, mode, planId: mode === 'credit' ? selectedPlan : undefined }, displayReadOptions(enabled && !!p && (mode === 'cash' || !!selectedPlan)));
  const q = quote.currentData;
  const [notes, setNotes] = useState(''), [message, setMessage] = useState(''), [confirm, setConfirm] = useState(false), [submitted, setSubmitted] = useState(false);
  const [attachments, setAttachments] = useState<Record<string, string>>({}), [vehicleId, setVehicle] = useState(''), [caseId, setCase] = useState('');
  const [caseCursor, setCaseCursor] = useState<string>();
  const vehicles = useGetVehiclesQuery(undefined, displayReadOptions(enabled && p?.kind === 'document'));
  const cases = useGetMyProCasesQuery(caseCursor, displayReadOptions(enabled && p?.kind === 'document'));
  const [apply, applyState] = useCommerceApplyMutation(), [upload, uploadState] = useCommerceUploadMutation();
  const lock = useRef(false), operation = useRef<{ payload: string; id: string } | null>(null);
  const choose = (newMode: 'cash' | 'credit', newPlan = planId) => { setMode(newMode); setPlan(newPlan); setConfirm(false); setMessage(''); };
  const attach = async (code: string) => {
    const current = scope(); if (!current() || lock.current) return;
    lock.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsMultipleSelection: false });
      if (result.canceled || !current()) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setMessage('Choisissez une image de moins de 5 Mo.'); return; }
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: asset.fileName || 'justificatif.jpg', type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
      const saved = await upload(form).unwrap();
      if (current()) setAttachments(items => ({ ...items, [code]: saved.id }));
    } catch (e) { if (current()) setMessage(proError(e)); }
    finally { lock.current = false; }
  };
  const ready = enabled && !!q && !quote.isFetching && !quote.isError && !product.isError &&
    !!p && p.details.requiredEvidence.every(code => attachments[code]) && (p.kind !== 'document' || (!!vehicleId && !!caseId));
  const submit = async () => {
    const current = scope(); if (!current() || !ready || !q || !p || lock.current) return;
    if (!confirm) { setConfirm(true); return; }
    lock.current = true; setMessage('');
    const body = { productId: id, mode: q.mode, planId: q.planId ?? undefined, quoteHash: q.quoteHash, depositMinor: q.depositMinor,
      installments: q.installments, period: q.period, notes: notes.trim(), evidence: p.details.requiredEvidence.map(code => ({ code, attachmentId: attachments[code] })),
      ...(p.kind === 'document' ? { vehicleId, caseId } : {}) };
    const payload = JSON.stringify(body);
    if (operation.current?.payload !== payload) operation.current = { payload, id: Crypto.randomUUID() };
    try {
      await apply({ ...body, mutationId: operation.current.id }).unwrap();
      if (current()) { setSubmitted(true); setMessage('Votre dossier est envoyé. Aucun débit maintenant : vous lirez le contrat avant de payer.'); }
    } catch (e) { if (current()) { setMessage(proError(e)); setConfirm(false); void quote.refetch(); } }
    finally { lock.current = false; }
  };
  return <ServiceLayout title={confirm ? 'Votre choix' : 'Détail du produit'} compact footer={submitted ?
    <ServiceButton title="Suivre mes achats" onPress={() => router.replace('/services/purchases' as Href)} /> :
    <ServiceButton title={confirm ? 'Envoyer mon dossier' : 'Vérifier mon choix'} disabled={!ready || uploadState.isLoading} busy={applyState.isLoading} onPress={submit} />}>
    {product.isLoading && <ActivityIndicator />}
    {product.isError && <View style={s.notice}><Text style={s.error}>Produit indisponible. Aucun paiement n’a été lancé.</Text><ServiceButton title="Réessayer" secondary disabled={!enabled} onPress={() => void product.refetch()} /></View>}
    {p && <>
      {!!p.details.imageUrl && !confirm && <Image source={{ uri: p.details.imageUrl }} style={{ width: '100%', height: 170 }} resizeMode="contain" accessibilityLabel={p.name} />}
      <Text style={s.title}>{p.name}</Text>
      {p.kind === 'vehicle' && <Text style={s.text}>Véhicule : au moins 9 mois d’activité réelle sur Zwanga, avec un trajet terminé avec passager tous les deux jours. Vérification avant accord et remise.</Text>}
      {!confirm && <><Text style={s.text}>{p.description}</Text>{!!p.details.specifications && <Text style={s.text}>{p.details.specifications}</Text>}{!!p.details.warranty && <Text style={s.text}>Garantie : {p.details.warranty}</Text>}</>}
      <TouchableOpacity style={s.notice} accessibilityRole="radio" accessibilityState={{ checked: mode === 'cash' }} disabled={submitted || applyState.isLoading} onPress={() => choose('cash')}>
        <Text style={s.label}>{mode === 'cash' ? '● ' : '○ '}Payer en une fois · {commerceMoney(p.prices.cashTotalMinor)}</Text>
        <Text style={s.text}>Vous économisez {commerceMoney(p.prices.cashSavingMinor)} (20 %) par rapport au prix à crédit.</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.notice} accessibilityRole="radio" accessibilityState={{ checked: mode === 'credit' }} disabled={submitted || applyState.isLoading} onPress={() => choose('credit')}>
        <Text style={s.label}>{mode === 'credit' ? '● ' : '○ '}Payer à crédit · {commerceMoney(p.prices.creditTotalMinor)} au total</Text>
        <Text style={s.text}>Choisissez une formule par semaine ou par mois.</Text>
      </TouchableOpacity>
      {mode === 'credit' && !confirm && p.prices.plans.map(plan => <TouchableOpacity key={plan.id} style={s.option} accessibilityRole="radio" accessibilityState={{ checked: selectedPlan === plan.id }} onPress={() => choose('credit', plan.id)} disabled={submitted || applyState.isLoading}>
        <Text style={s.label}>{selectedPlan === plan.id ? '●' : '○'} {plan.count} {plan.period === 'week' ? 'semaines' : 'mois'}</Text>
      </TouchableOpacity>)}
      {quote.isFetching && <ActivityIndicator accessibilityLabel="Calcul du prix" />}
      {quote.isError && <><Text style={s.error}>{proError(quote.error)}</Text><ServiceButton title="Actualiser le prix" secondary disabled={!enabled} onPress={() => void quote.refetch()} /></>}
      {q && !quote.isFetching && <View style={s.section}>
        <Text style={s.label}>Avant la remise : {commerceMoney(q.beforeDeliveryMinor)}</Text>
        {q.mode === 'credit' && <><Text style={s.text}>{q.depositMinor === '0' ? 'Première échéance payée en avance.' : `Acompte de ${commerceMoney(q.depositMinor)}, inclus dans le total.`}</Text>
          <Text style={s.text}>{q.installments} échéances de {commerceMoney(q.installmentAmountsMinor[0])}{q.period === 'week' ? ' par semaine' : ' par mois'}{q.installmentAmountsMinor.at(-1) !== q.installmentAmountsMinor[0] ? ` ; dernière : ${commerceMoney(q.installmentAmountsMinor.at(-1)!)}` : ''}.</Text>
          <Text style={s.text}>Vous pouvez payer un peu chaque jour. Vos paiements et retenues sur trajets réduisent les mêmes échéances. Recharger le compte seul ne rembourse pas le crédit.</Text>
          <Text style={s.text}>Retenue automatique sur les trajets payés en électronique ou en jetons. Pour les trajets cash, remboursement volontaire avec votre solde Zwanga.</Text>
          <Text style={s.text}>Soldez en avance : 10 % de remise sur le reste dû, sans retard et au moins une période avant la dernière échéance. Non cumulable avec le prix comptant.</Text>
          {!!p.repayment && <Text style={s.text}>Sur les revenus nets disponibles : {p.repayment.netIncomeBps / 100} % pour ce contrat{p.repayment.fixedPerTripMinor !== '0' ? ` + ${commerceMoney(p.repayment.fixedPerTripMinor)} par trajet` : ''}. Les retenues de plusieurs contrats peuvent s’additionner.</Text>}
        </>}
        <Text style={s.text}>{p.delivery} Délai indicatif : {p.details.processingDays} jour(s).</Text>
      </View>}
      {!confirm && !submitted && <>
        {p.kind === 'document' && <View style={s.section}><Text style={s.label}>Véhicule et dossier documentaire</Text>
          {vehicles.currentData?.filter(v => v.isActive).map(v => <TouchableOpacity key={v.id} style={s.option} onPress={() => setVehicle(v.id)}><Text style={s.text}>{v.id === vehicleId ? '●' : '○'} {v.brand} {v.model} · {v.licensePlate}</Text></TouchableOpacity>)}
          {cases.currentData?.items.filter(c => c.serviceCode === 'documents').map(c => <TouchableOpacity key={c.id} style={s.option} onPress={() => setCase(c.id)}><Text style={s.text}>{c.id === caseId ? '●' : '○'} Dossier du {new Date(c.createdAt).toLocaleDateString('fr-FR')}</Text></TouchableOpacity>)}
          {!!cases.currentData?.nextCursor && <ServiceButton title="Autres dossiers" secondary onPress={() => setCaseCursor(cases.currentData?.nextCursor ?? undefined)} />}
          <ServiceButton title="Préparer mon dossier documentaire" secondary onPress={() => router.push('/services/new?service=documents')} />
        </View>}
        {p.details.requiredEvidence.length > 0 && <Text style={s.label}>Pièces et garanties à fournir</Text>}
        {p.details.requiredEvidence.map(code => <ServiceButton key={code} title={`${attachments[code] ? '✓ ' : 'Ajouter : '}${code.replace(/-/g, ' ')}`} secondary busy={uploadState.isLoading} onPress={() => void attach(code)} />)}
        <Text style={s.label}>Une précision ? (facultatif)</Text><TextInput style={s.input} value={notes} onChangeText={setNotes} multiline maxLength={1000} accessibilityLabel="Commentaire sur mon choix" editable={!applyState.isLoading} />
      </>}
      {confirm && <View style={s.terms}><Text style={s.label}>Conditions de l’offre</Text><Text style={s.text}>{p.terms}</Text><Text style={s.text}>Envoyer ce dossier ne signe pas le contrat. Vous recevrez une proposition à lire et accepter avant tout paiement.</Text></View>}
    </>}
    {!!message && <Text style={s.text} accessibilityRole="alert">{message}</Text>}
  </ServiceLayout>;
}
