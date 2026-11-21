import React, { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useUpdateCreditRequestCommentMutation, type AssetCreditRequest } from '@/store/api/assetCreditApi';
import { useWalletScreenScope } from '@/hooks/wallet/useWalletScreenScope';
import { ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { creditEquipmentLabel } from './assetCreditModel';
import { proError } from './model';

export function CreditRequestComment({ request, scope, enabled }: { request: AssetCreditRequest; scope: string; enabled: boolean }) {
  const [editing, setEditing] = useState(false), [notes, setNotes] = useState(request.notes), [message, setMessage] = useState('');
  const [save, state] = useUpdateCreditRequestCommentMutation();
  const capture = useWalletScreenScope(scope, enabled), lock = useRef(false);
  const submit = async () => {
    const current = capture();
    if (!current() || lock.current || request.status !== 'submitted') return;
    lock.current = true; setMessage('');
    try { await save({ id: request.id, notes: notes.trim() }).unwrap(); if (current()) { setEditing(false); setMessage('Commentaire enregistré.'); } }
    catch (error) { if (current()) setMessage(proError(error)); }
    finally { lock.current = false; }
  };
  return <View style={s.notice}>
    <Text style={s.label}>{creditEquipmentLabel(request.assetKind)} · Dossier envoyé</Text>
    {editing ? <TextInput style={s.input} value={notes} onChangeText={setNotes} multiline textAlignVertical="top"
      maxLength={1000} editable={!state.isLoading} accessibilityLabel="Votre commentaire sur le dossier" />
      : !!request.notes && <Text style={s.text}>Votre commentaire : {request.notes}</Text>}
    <Text style={s.text}>Vous choisirez votre mensualité dans l’offre chiffrée de Zwanga.</Text>
    <ServiceButton title={editing ? 'Enregistrer le commentaire' : request.notes ? 'Modifier mon commentaire' : 'Ajouter un commentaire'}
      secondary busy={state.isLoading} disabled={!enabled} onPress={() => {
        if (!enabled) return;
        if (editing) void submit(); else { setNotes(request.notes); setMessage(''); setEditing(true); }
      }} />
    {editing && !state.isLoading && <ServiceButton title="Annuler" secondary onPress={() => setEditing(false)} />}
    {!!message && <Text style={s.text} accessibilityRole="alert">{message}</Text>}
  </View>;
}
