import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/forms/FormLayout';
import { LocationPickerContent } from '@/components/LocationPickerModal';
import { ACTION_COLORS } from '@/constants/actionColors';
import { Colors } from '@/constants/styles';
import { homeRequestStyles as s } from '@/features/trip-request/homeRequestStyles';
import { useHomeRequestFlow } from '@/hooks/trip-request/useHomeRequestFlow';
import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';
import type { useRequestFormNavigation } from '@/hooks/trip-request/useRequestFormNavigation';
import { RequestBudgetFields } from './RequestBudgetFields';
import { RequestDatePickerModal } from './RequestDatePickerModal';
import { RequestSuccessModal } from './RequestSuccessModal';
import { DirectDriverNotice } from './DirectDriverNotice';
import { HomeRequestChoices } from './HomeRequestChoices';
import { HomeRequestExtras } from './HomeRequestExtras';
import { HomeRequestMap } from './HomeRequestMap';

type Props = { form: RequestTripController; navigation: ReturnType<typeof useRequestFormNavigation> };

export function HomeRequestScreen({ form, navigation }: Props) {
  const flow = useHomeRequestFlow(form);
  const { height, fontScale } = useWindowDimensions();
  if (flow.pickerTarget) {
    const departure = flow.pickerTarget === 'departure';
    return <FormScreen style={s.screen}>
      {form.isScreenActive && <LocationPickerContent key={flow.pickerTarget} visible mapEnabled={form.hasAppliedRoutePrefill}
        compact={height < 650 || fontScale > 1.2}
        title={departure ? 'Où vous chercher ?' : 'Où allez-vous ?'}
        contextLabel={departure ? `Arrivée : ${form.arrivalAddress}` : form.departureLocation ? `Départ : ${form.departureAddress}` : undefined}
        confirmLabel={departure ? 'Me chercher ici' : 'Aller ici'}
        initialLocation={departure ? form.departureLocation : form.arrivalLocation}
        focusSearchOnOpen={!departure && !form.arrivalLocation} autoLocateOnOpen={false}
        onClose={flow.closePicker} onSelect={flow.onSelect} />}
    </FormScreen>;
  }
  const ready = Boolean(form.departureLocation && form.arrivalLocation);
  const disabled = flow.locked || !ready || !form.canSubmitRequestDetails;
  const label = !ready ? 'Recherche de votre position…' : !form.hasChosenDepartureTime
    ? 'Choisir l’heure de départ' : form.targetDriver ? 'Envoyer à ce conducteur' : 'Commander le trajet';
  const mapHeight = Math.max(120, Math.min(180, height * (fontScale > 1.2 ? 0.18 : 0.21)));
  return <FormScreen style={s.screen}>
    <View style={s.header}>
      <TouchableOpacity style={s.back} onPress={flow.handleBack} disabled={flow.locked}
        accessibilityRole="button" accessibilityLabel="Retour à l’accueil" accessibilityState={{ disabled: flow.locked }}>
        <Ionicons name="chevron-back" size={24} color={ACTION_COLORS.blue} />
      </TouchableOpacity>
      <Text style={s.title}>Votre commande</Text>
    </View>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={navigation.scrollRef} style={s.flex} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        testID="home-request-content" pointerEvents={flow.locked ? 'none' : 'auto'}
        accessibilityElementsHidden={flow.locked} importantForAccessibility={flow.locked ? 'no-hide-descendants' : 'auto'}>
        <View style={s.route}>
          {(['departure', 'arrival'] as const).map(target => {
            const address = target === 'departure' ? form.departureAddress : form.arrivalAddress;
            const title = target === 'departure' ? 'Départ' : 'Arrivée';
            return <TouchableOpacity key={target} style={s.location} onPress={() => flow.openPicker(target)}
              disabled={flow.locked} accessibilityRole="button" accessibilityLabel={`${title} : ${address || 'Votre position'}. Modifier`}>
              <Ionicons name={target === 'departure' ? 'locate-outline' : 'location-outline'} size={20}
                color={target === 'departure' ? ACTION_COLORS.blue : ACTION_COLORS.orange} />
              <View style={s.locationCopy}><Text style={s.label}>{title}</Text>
                <Text style={s.locationText} numberOfLines={2}>{address || 'Recherche de votre position…'}</Text>
              </View>
              <Ionicons name="pencil-outline" size={16} color={Colors.gray[600]} />
            </TouchableOpacity>;
          })}
        </View>
        <HomeRequestMap departureLocation={form.departureLocation} arrivalLocation={form.arrivalLocation}
          routeCoordinates={form.routeCoordinates} routePreviewRegion={form.routePreviewRegion}
          routeDistanceLabel={form.routeDistanceLabel} isRouteLoading={form.isRouteLoading}
          enabled={form.isScreenActive} height={mapHeight} />
        <View style={s.content}>
          <DirectDriverNotice prefill={form.directDriverPrefill} driver={form.targetDriver} disabled={flow.locked} />
          <HomeRequestChoices form={form} />
          {ready ? <RequestBudgetFields {...form} compact section="price" />
            : <View style={s.locating}><ActivityIndicator color={ACTION_COLORS.blue} />
              <Text style={s.summary}>Recherche du départ pour calculer le prix…</Text></View>}
          <HomeRequestExtras form={form} />
        </View>
      </ScrollView>
      {!form.isRequestSuccessVisible && <View style={s.footer} testID="home-request-footer">
        {form.submissionError && <Text style={s.error} accessibilityLiveRegion="polite">{form.submissionError}</Text>}
        <TouchableOpacity style={[s.submit, disabled && s.disabled]} disabled={disabled} accessibilityRole="button"
          accessibilityState={{ disabled, busy: form.isCreating || !ready }} onPress={flow.submit}>
          {form.isCreating ? <ActivityIndicator color={Colors.white} /> : <Text style={s.submitText}>{label}</Text>}
        </TouchableOpacity>
      </View>}
    </KeyboardAvoidingView>
    <RequestDatePickerModal iosPickerValue={form.iosPickerValue} handleIosPickerChange={form.handleIosPickerChange}
      insets={form.insets} iosPickerMode={form.iosPickerMode} closeDatePicker={form.closeDatePicker} confirmIosPicker={form.confirmIosPicker} />
    <RequestSuccessModal createdRequestId={form.createdRequestId} goHomeAfterRequestSuccess={form.goHomeAfterRequestSuccess}
      goToRequestSuccessDetail={form.goToRequestSuccessDetail} insets={form.insets} isRequestSuccessVisible={form.isRequestSuccessVisible}
      isResolvingSentRequest={form.isResolvingSentRequest} requestSuccessDetailLabel={form.requestSuccessDetailLabel}
      requestSuccessText={form.requestSuccessText} />
  </FormScreen>;
}
