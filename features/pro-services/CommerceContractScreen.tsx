import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { ServiceLayout, ServiceButton, s } from './ServiceLayout';
import { commerceAmount, commerceMoney, commerceStatus } from './commerceModel';
import { proError } from './model';
import { useCommerceContractQuery, useCommerceAcceptMutation, useCommercePayMutation, useLazyCommerceSettlementQuery,
  useCommerceSettleMutation, useLazyCommercePlansQuery, useCommerceChangePlanMutation } from '@/store/api/commerceApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useWalletScreenScope } from '@/hooks/wallet/useWalletScreenScope';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';

type Confirmation = { label: string; identity: string; run: (mutationId: string) => Promise<unknown> };
export function CommerceContractScreen({ id }: { id: string }) {
  const user = useAppSelector(selectUser), enabled = useDisplayReadsEnabled(useScreenIsActive());
  const scope = useWalletScreenScope(user?.id, enabled);
  const query = useCommerceContractQuery(id, displayReadOptions(enabled)), c = query.currentData;
  const [accept] = useCommerceAcceptMutation(), [pay] = useCommercePayMutation(), [settle] = useCommerceSettleMutation(), [change] = useCommerceChangePlanMutation();
  const [getSettlement] = useLazyCommerceSettlementQuery(), [getPlans, plans] = useLazyCommercePlansQuery();
  const [consent, setConsent] = useState(false), [amount, setAmount] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [showPlans, setShowPlans] = useState(false), [showSchedule, setShowSchedule] = useState(false);
  const lock = useRef(false), operation = useRef<{ identity: string; id: string } | null>(null);
  const ready = enabled && !!c && !query.isError && !query.isFetching && !busy;
  const cash = c?.snapshot.purchase?.mode === 'cash';
  const depositLeft = c ? BigInt(c.depositMinor) - BigInt(c.depositPaidMinor) : 0n;
  const remaining = c?.remainingMinor ?? '0';
  const schedule = c?.installments ?? [];
  const due = schedule.find(i => i.remainingMinor !== '0');
  const purpose = depositLeft > 0n ? 'deposit' : 'repayment';
  const maximum = depositLeft > 0n ? depositLeft : BigInt(remaining);
  const parsed = commerceAmount(amount);
  const confirmPay = () => {
    if (!ready || !parsed || BigInt(parsed) > maximum) return;
    setConfirmation({ label: `Payer ${commerceMoney(parsed)} avec mon solde Zwanga`, identity: `pay:${purpose}:${parsed}:${c?.creditedMinor ?? c?.paidMinor}:${c?.depositPaidMinor}`,
      run: mutationId => pay({ id, mutationId, purpose, amountMinor: parsed }).unwrap() });
  };
  const execute = async () => {
    const current = scope(); if (!ready || !current() || !confirmation || lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    if (operation.current?.identity !== confirmation.identity) operation.current = { identity: confirmation.identity, id: Crypto.randomUUID() };
    try {
      await confirmation.run(operation.current.id);
      if (current()) { setMessage('Opération confirmée.'); setConfirmation(null); setAmount(''); setConsent(false); setShowPlans(false); void query.refetch(); }
    } catch (e) { if (current()) { setMessage(proError(e)); void query.refetch(); } }
    finally { lock.current = false; setBusy(false); }
  };
  const acceptContract = () => {
    if (!ready || !c || !consent) return;
    const until = new Date();
    if (c.snapshot.purchase?.period === 'week') until.setUTCDate(until.getUTCDate() + c.snapshot.purchase.installments * 7 + 7);
    else until.setUTCMonth(until.getUTCMonth() + (c.snapshot.purchase?.installments ?? 12));
    if (c.snapshot.purchase?.period !== 'week') until.setUTCDate(until.getUTCDate() + 7);
    const mandateUntil = cash ? undefined : until.toISOString();
    setConfirmation({ label: cash ? 'Accepter le contrat au prix comptant. Aucun prélèvement automatique.' : `Accepter le contrat et les retenues indiquées jusqu’au ${until.toLocaleDateString('fr-FR')}.`,
      identity: `accept:${c.termsHash}:${mandateUntil ?? 'cash'}`, run: mutationId => accept({ id, mutationId, consent: true, termsHash: c.termsHash, mandateUntil }).unwrap() });
  };
  const quoteSettlement = async () => {
    const current = scope(); if (!ready || !current() || lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const quote = await getSettlement(id, false).unwrap();
      if (current()) setConfirmation({ label: `Solder pour ${commerceMoney(quote.amountMinor)} au lieu de ${commerceMoney(quote.remainingMinor)}. Remise : ${commerceMoney(quote.discountMinor)}.`,
        identity: `settle:${quote.quoteHash}`, run: mutationId => settle({ id, mutationId, quoteHash: quote.quoteHash }).unwrap() });
    } catch (e) { if (current()) setMessage(proError(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ServiceLayout title="Mon achat" compact footer={confirmation && <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
    <Text style={s.label}>Confirmation</Text><Text style={s.text}>{confirmation.label}</Text>
    <ServiceButton title="Confirmer" busy={busy} disabled={!ready} onPress={() => void execute()} />
    <ServiceButton title="Pas maintenant" secondary disabled={busy} onPress={() => setConfirmation(null)} />
    {!!message && <Text accessibilityRole="alert" style={s.text}>{message}</Text>}
  </ScrollView>}>
    {query.isLoading && <ActivityIndicator />}
    {query.isError && <View style={s.notice}><Text style={s.error}>Les montants ne sont pas à jour. Aucun nouveau paiement ne peut être lancé.</Text><ServiceButton title="Actualiser" secondary disabled={!enabled} onPress={() => void query.refetch()} /></View>}
    {c && <>
      <Text style={s.badge}>{commerceStatus[c.status] ?? c.status} · {cash ? 'Paiement comptant' : 'Paiement à crédit'}</Text>
      <Text style={s.title}>{c.label}</Text>
      <View style={s.section}><Text style={s.label}>Reste à payer : {commerceMoney((BigInt(remaining) + depositLeft).toString())}</Text>
        <Text style={s.text}>Déjà payé : {commerceMoney((BigInt(c.paidMinor) + BigInt(c.depositPaidMinor)).toString())}</Text>
        {!!c.discountMinor && c.discountMinor !== '0' && <Text style={s.text}>Remise accordée : {commerceMoney(c.discountMinor)}</Text>}
        <Text style={s.text}>Remise du produit : {commerceStatus[c.deliveryState] ?? c.deliveryState}</Text>
      </View>
      {due && <View style={s.notice}><Text style={s.label}>Prochaine échéance : {commerceMoney(due.remainingMinor)}</Text><Text style={s.text}>Avant le {new Date(due.dueAt).toLocaleDateString('fr-FR')}{due.overdueDays ? ` · ${due.overdueDays} jour(s) de retard` : ''}</Text></View>}
      <Text style={s.label}>Votre contrat</Text><Text style={s.text}>{c.snapshot.policy.terms}</Text>
      {!!c.snapshot.purchase && <Text style={s.text}>Prix convenu : {commerceMoney(c.snapshot.purchase.totalMinor)}. Avant remise : {commerceMoney(c.snapshot.purchase.beforeDeliveryMinor)}.</Text>}
      {!cash && <><Text style={s.text}>Chaque paiement réduit vos échéances, y compris les petits paiements quotidiens. Recharger votre compte n’est pas encore un remboursement.</Text>
        <Text style={s.text}>Retenue de ce contrat : {c.snapshot.policy.rules.netIncomeBps / 100} % des revenus nets disponibles{c.snapshot.policy.rules.fixedPerTripMinor !== '0' ? ` + ${commerceMoney(c.snapshot.policy.rules.fixedPerTripMinor)} par trajet` : ''}. Les autres crédits restent distincts.</Text>
        <Text style={s.text}>Pour cette offre, les retenues automatiques concernent les trajets réglés en électronique ou en jetons. Après un trajet cash, payez ici avec votre solde rechargé.</Text></>}
      {c.status === 'offered' && <>
        <TouchableOpacity style={s.option} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} disabled={!ready} onPress={() => setConsent(v => !v)}><Text style={s.label}>{consent ? '☑' : '☐'} J’ai lu le contrat, le prix et les conditions de paiement.</Text></TouchableOpacity>
        <ServiceButton title="Accepter ce contrat" disabled={!ready || !consent} onPress={acceptContract} />
      </>}
      {['accepted', 'active'].includes(c.status) && !['returned', 'rejected'].includes(c.deliveryState) && maximum > 0n && <View style={s.section}>
        <Text style={s.label}>{purpose === 'deposit' ? 'Payer mon acompte' : cash ? 'Payer mon achat' : 'Payer le montant de mon choix'}</Text>
        <Text style={s.text}>Avec le solde rechargé dans Zwanga. Maximum : {commerceMoney(maximum.toString())}.</Text>
        <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" accessibilityLabel="Montant en francs congolais" placeholder="Montant en FC" editable={ready && !confirmation} maxLength={13} />
        <ServiceButton title="Vérifier ce paiement" disabled={!ready || !parsed || BigInt(parsed) > maximum} onPress={confirmPay} />
      </View>}
      {c.status === 'active' && c.snapshot.purchase?.mode === 'credit' && <>
        <ServiceButton title="Voir mon prix pour tout solder" secondary disabled={!ready} onPress={() => void quoteSettlement()} />
        <Text style={s.text}>10 % de remise sur le solde restant, sans retard et au moins une période avant la fin prévue. Aucun cumul avec le tarif comptant.</Text>
        <ServiceButton title="Changer de formule" secondary disabled={!ready} onPress={async () => {
          const current = scope(); if (!current()) return;
          try { await getPlans(id, false).unwrap(); if (current()) { setShowPlans(true); setMessage(''); } }
          catch (e) { if (current()) setMessage(proError(e)); }
        }} />
        {showPlans && plans.currentData?.plans.map(plan => <ServiceButton key={plan.id} secondary title={`${plan.count} ${plan.period === 'week' ? 'semaines' : 'mois'} · ${commerceMoney(plan.installments[0].amountMinor)} / échéance`} disabled={!ready} onPress={() => {
          const options = plans.currentData!;
          setConfirmation({ label: `Changer sans frais : première échéance le ${new Date(plan.installments[0].dueAt).toLocaleDateString('fr-FR')}, dernière le ${new Date(plan.installments.at(-1)!.dueAt).toLocaleDateString('fr-FR')}. Solde inchangé : ${commerceMoney(options.remainingMinor)}.`,
            identity: `plan:${plan.id}:${options.version}:${options.remainingMinor}`, run: mutationId => change({ id, mutationId, planId: plan.id, expectedVersion: options.version, expectedRemainingMinor: options.remainingMinor }).unwrap() });
        }} />)}
      </>}
      {!!schedule.length && <><ServiceButton title={showSchedule ? 'Masquer les échéances' : 'Voir toutes les échéances'} secondary onPress={() => setShowSchedule(v => !v)} />
        {showSchedule && schedule.map(i => <View key={i.ordinal} style={s.section}><Text style={s.label}>Échéance {i.ordinal} · {new Date(i.dueAt).toLocaleDateString('fr-FR')}</Text><Text style={s.text}>{commerceMoney(i.amountMinor)} · {i.remainingMinor === '0' ? 'Réglée' : `reste ${commerceMoney(i.remainingMinor)}`}</Text></View>)}</>}
    </>}
    {!!message && !confirmation && <Text accessibilityRole="alert" style={s.text}>{message}</Text>}
  </ServiceLayout>;
}
