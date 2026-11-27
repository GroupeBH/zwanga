import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import type { buildRequestDetailPresentation } from './requestPresentation';
import { CollapsibleRouteMap } from './CollapsibleRouteMap';
import { ChangeRequestDriverButton } from './ChangeRequestDriverButton';
import { RequestConfirmedDriver } from './RequestConfirmedDriver';
import { RequestOwnerModals } from './RequestOwnerModals';
import { formatCdfPrice } from './requestDetailModel';
import { formatRequestDay, formatRequestTime } from './requestDateLabels';
import { canChangeRequestDriver } from './requestDriverChangePolicy';
import { confirmedRequestStyles as s } from './confirmedRequestStyles';
import { passengerRideStage } from '@/features/passenger-navigation/passengerRideProgress';
import { RidePaymentNotice } from '@/features/ride-payment/RidePaymentNotice';

type Props = { model: ReturnType<typeof useRequestDetailController>; presentation: ReturnType<typeof buildRequestDetailPresentation>;
  onLayout?: () => void };

/** Accepted passenger order: route visible immediately, no discovery cards or repeated progress list. */
export function RequestConfirmedScreen({ model, presentation, onLayout }: Props) {
  const request = model.tripRequest!;
  const stage = model.passengerBooking ? passengerRideStage(model.passengerBooking) : 'waiting';
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width > height;
  const compactActions = fontScale <= 1.3;
  const mapHeight = landscape ? Math.max(140, height - 110) : Math.min(330, height * (height < 700 || fontScale > 1.3 ? 0.22 : 0.36));
  const labels = useRouteLocationLabels(request);
  const [changingDriver, setChangingDriver] = useState(false);
  const busy = changingDriver || model.isCancelling || model.isUpdating;
  const changeRequest = !request.tripId || model.passengerBooking ? request : undefined;
  const showChange = canChangeRequestDriver(changeRequest, model.userId, model.passengerBooking, model.assignedTrip);
  const day = formatRequestDay(request.departureDateMin), endDay = formatRequestDay(request.departureDateMax);
  return <SafeAreaView onLayout={onLayout} style={s.screen}>
    <View style={s.header}>
      <Pressable style={s.iconButton} accessibilityRole="button" accessibilityLabel="Retour à l’accueil" onPress={model.goHome}>
        <Ionicons name="arrow-back" size={24} color="#1E294A" />
      </Pressable>
      <Text style={s.title} maxFontSizeMultiplier={1.3} accessibilityRole="header">{stage === 'dropoff' ? 'Arrivée confirmée' : stage === 'pickup' ? 'En route' : 'Commande confirmée'}</Text>
      {model.canCancel && <Pressable style={s.iconButton} accessibilityRole="button" accessibilityLabel="Annuler la commande"
        disabled={busy} accessibilityState={{ disabled: busy, busy: model.isCancelling }} onPress={model.handleCancelRequest}>
        {model.isCancelling ? <ActivityIndicator color="#B42318" /> : <Ionicons name="close-circle-outline" size={24} color="#B42318" />}
      </Pressable>}
    </View>
    <View style={[s.workspace, landscape && s.landscape]}>
      <View style={landscape ? s.landscapeMap : undefined}>
        <CollapsibleRouteMap displayMode="overview" variant="light" overviewHeight={mapHeight} showRecenter
          mapData={presentation.requestRouteMapData} routeCoordinates={presentation.displayedRouteCoordinates}
          departureName={labels.departure.address} arrivalName={labels.arrival.address} />
      </View>
      <View style={s.panel}>
        <ScrollView testID="confirmed-request-content" style={s.scroll} contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={model.refreshing} onRefresh={model.onRefresh} tintColor="#D54100" />}>
          <RequestConfirmedDriver key={`pickup:${request.id}`} request={request} booking={model.passengerBooking ?? undefined} active={model.isScreenActive} />
          <RidePaymentNotice booking={model.passengerBooking} active={model.isScreenActive} />
          <View style={s.route}>
            {(['departure', 'arrival'] as const).map((stop, index) => <View key={stop} style={s.stop}>
              <View style={s.track}><View style={index === 0 ? s.startDot : s.endDot} />{index === 0 && <View style={s.line} />}</View>
              <View style={s.copy}>
                <Text style={s.label}>{index === 0 ? 'Départ' : 'Destination'}</Text>
                <Text style={s.address}>{labels[stop].title}</Text>
                {!!labels[stop].context && <Text style={s.context}>{labels[stop].context}</Text>}
                {!!labels[stop].reference && <Text style={s.context}>Réf. : {labels[stop].reference}</Text>}
              </View>
            </View>)}
          </View>
          <View style={s.priceRow}><View style={s.copy}>
            <Text style={s.label}>Prix du trajet</Text>
            <Text style={s.context}>{request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}</Text>
          </View><Text style={s.price}>{presentation.ownerDisplayedBudget != null ? formatCdfPrice(presentation.ownerDisplayedBudget) : 'À convenir'}</Text></View>
          <Text style={s.schedule}>Départ souhaité · {day} · {formatRequestTime(request.departureDateMin)}–{day !== endDay ? `${endDay} ` : ''}{formatRequestTime(request.departureDateMax)}</Text>
          {request.selectedDriverRequiresPassengerKyc && <Text style={s.context}>Identité vérifiée requise avant le départ.</Text>}
        </ScrollView>
        <ScrollView testID="confirmed-request-actions" style={{ flexGrow: 0, maxHeight: height * 0.4 }} contentContainerStyle={[s.footer, compactActions && s.actionsRow]}>
          {showChange && <View style={compactActions ? s.actionColumn : undefined}>
          <ChangeRequestDriverButton key={`change:${request.id}`} compact
            request={changeRequest}
            booking={model.passengerBooking} trip={model.assignedTrip} onPendingChange={setChangingDriver}
            disabled={!model.isScreenActive || model.isCancelling || model.isUpdating} />
          </View>}
          {request.tripId && <Pressable style={[s.primary, compactActions && s.actionColumn, busy && s.disabled]} accessibilityRole="button" disabled={busy}
            onPress={() => model.handleViewTrip(request.tripId!)}>
            <Ionicons name="navigate-outline" size={20} color="#FFFFFF" accessible={false} /><Text style={s.primaryText}>Voir mon trajet</Text>
          </Pressable>}
        </ScrollView>
      </View>
    </View>
    <RequestOwnerModals model={model} />
  </SafeAreaView>;
}
