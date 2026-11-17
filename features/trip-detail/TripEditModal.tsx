import { TripEditFields, type TripEditFieldsProps } from './TripEditFields';
import { FormModal } from '@/components/forms/FormLayout';
import { ACTION_COLORS } from '@/constants/actionColors';
import { tripEditorStyles as s } from '@/features/trips/tripEditorStyles';
import { getTripEditReferenceError } from '@/features/trips/tripEditReferences';
import { getLocationText } from '@/features/trips/tripsModel';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

export interface TripEditModalProps extends TripEditFieldsProps {
  editTripModalVisible: boolean;
  closeEditModal: () => void;
  handleBackToEditRoute: () => void;
  isSavingTrip: boolean;
  handleSaveTrip: () => Promise<void>;
}

/** One shared sheet for trip-detail and My Trips; native modal sequencing is unchanged. */
export function TripEditModal(props: TripEditModalProps) {
  const { editTripModalVisible: visible, editModalBottomPadding, isSavingTrip } = props;
  const scrollRef = useRef<ScrollView>(null);
  const pending = useRef(false), mounted = useRef(false);
  const [localSaving, setLocalSaving] = useState(false);
  const busy = isSavingTrip || localSaving;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const close = () => { if (!pending.current && !isSavingTrip) props.closeEditModal(); };
  const save = async () => {
    if (pending.current || isSavingTrip || !visible) return;
    pending.current = true; setLocalSaving(true); Keyboard.dismiss();
    const departure = props.editRouteMode === 'manual' ? props.editDepartureManualAddress : getLocationText(props.editDepartureSelection, '');
    const arrival = props.editRouteMode === 'manual' ? props.editArrivalManualAddress : getLocationText(props.editArrivalSelection, '');
    if (!departure.trim() || !arrival.trim() || getTripEditReferenceError(props.editReferences, departure, arrival,
      props.editDepartureSelection, props.editArrivalSelection)) scrollRef.current?.scrollTo({ y: 0, animated: true });
    try { await props.handleSaveTrip(); }
    finally { pending.current = false; if (mounted.current) setLocalSaving(false); }
  };
  const content = <View style={s.overlay}>
        {Platform.OS === 'android' && <TouchableOpacity style={s.backdrop} activeOpacity={1}
          disabled={busy} onPress={close} accessible={false} />}
        <View style={[s.sheet, Platform.OS === 'ios' && s.sheetIos]}>
          {Platform.OS === 'android' && <View style={s.handle} />}
          <View style={s.header}>
            <Text style={s.title}>{props.trip?.canReprogram ? 'Reprogrammer le trajet' : 'Modifier le trajet'}</Text>
            <TouchableOpacity style={s.close} onPress={close} disabled={busy} accessibilityRole="button"
              accessibilityLabel="Fermer sans enregistrer" accessibilityState={{ disabled: busy }}>
              <Ionicons name="close" size={22} color={ACTION_COLORS.blue} />
            </TouchableOpacity>
          </View>
          {props.trip?.canReprogram && <Text style={s.notice}>Nouvelle publication, sans les anciennes réservations.</Text>}
          {visible && <TripEditFields key={props.trip?.id} {...props} scrollRef={scrollRef} disabled={busy} />}
          <View style={[s.footer, { paddingBottom: editModalBottomPadding }]} testID="trip-edit-footer">
            <TouchableOpacity style={[s.save, busy && s.disabled]} onPress={save} disabled={busy}
              accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}>
              {busy && <ActivityIndicator color="#FFFFFF" size="small" />}
              <Text style={s.saveText}>{busy ? 'Enregistrement…' : props.trip?.canReprogram ? 'Publier ce trajet' : 'Enregistrer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>;
  return <FormModal
    transparent={Platform.OS === 'android'}
    animationType="slide"
    presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
    statusBarTranslucent={Platform.OS === 'android'} navigationBarTranslucent={Platform.OS === 'android'}
    visible={visible} onRequestClose={close}>
    {Platform.OS === 'ios' ? (
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={s.keyboard}>{content}</KeyboardAvoidingView>
    ) : (
      // Both the Android activity and native Modal use adjustResize. Applying
      // KAV height as well creates a second resize when the input relayouts.
      <View style={s.keyboard}>{content}</View>
    )}
  </FormModal>;
}
