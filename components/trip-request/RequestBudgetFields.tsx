import { Colors } from '@/constants/styles';
import { PassengerSeatNotice } from '@/components/PassengerSeatNotice';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { getPassengerVehicleSeatCapacity } from '@/utils/passengerSeats';
import {
  clampRequestSeats,
  MIN_REQUEST_PRICE,
  MIN_REQUEST_SEATS,
  REQUEST_PRICE_STEP,
  TRIP_PAYMENT_MODE_OPTIONS
} from '@/features/trip-request/requestFormModel';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = Pick<RequestTripController,
  | 'isPriceLoading'
  | 'vehicleOptions'
  | 'isVehicleOptionsError'
  | 'retryVehicleOptions'
  | 'budgetValue'
  | 'updateBudget'
  | 'budgetLabel'
  | 'budgetHintLabel'
  | 'totalBudgetLabel'
  | 'requestSeatsLabel'
  | 'hasSpecifiedNumberOfSeats'
  | 'numberOfSeats'
  | 'selectedVehicleType'
  | 'setHasSpecifiedNumberOfSeats'
  | 'setNumberOfSeats'
  | 'requestPaymentMode'
  | 'setRequestPaymentMode'
  | 'setShowAdvanced'
  | 'showAdvanced'
  | 'description'
  | 'setDescription'
>;

export function RequestBudgetFields({
  isPriceLoading,
  vehicleOptions,
  isVehicleOptionsError,
  retryVehicleOptions,
  budgetValue,
  updateBudget,
  budgetLabel,
  budgetHintLabel,
  totalBudgetLabel,
  requestSeatsLabel,
  hasSpecifiedNumberOfSeats,
  numberOfSeats,
  selectedVehicleType,
  setHasSpecifiedNumberOfSeats,
  setNumberOfSeats,
  requestPaymentMode,
  setRequestPaymentMode,
  setShowAdvanced,
  showAdvanced,
  description,
  setDescription,
}: Props) {
  const { isIdentityVerified, checkIdentity } = useIdentityCheck();
  const seatCapacity = getPassengerVehicleSeatCapacity(selectedVehicleType);
  const cannotAddSeat = numberOfSeats >= (seatCapacity ?? Number.MAX_SAFE_INTEGER);
  return (
    <>
      {isPriceLoading && vehicleOptions.length === 0 ? (
        <View style={styles.vehicleChoiceLoading}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.vehicleChoiceLoadingText}>Calcul du tarif en cours…</Text>
        </View>
      ) : null}

      {!isPriceLoading && isVehicleOptionsError && vehicleOptions.length === 0 ? (
        <View style={styles.vehicleChoiceError}>
          <View style={styles.vehicleChoiceErrorCopy}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
            <Text style={styles.vehicleChoiceErrorText}>
              Tarif indisponible pour le moment. Fixez votre budget ci-dessous ou réessayez.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.vehicleChoiceRetry}
            onPress={() => retryVehicleOptions()}
            activeOpacity={0.8}
          >
            <Text style={styles.vehicleChoiceRetryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.offerPriceControl}>
        <TouchableOpacity
          style={[styles.offerPriceButton, budgetValue <= MIN_REQUEST_PRICE && styles.offerPriceButtonDisabled]}
          onPress={() => updateBudget(budgetValue - REQUEST_PRICE_STEP)}
          disabled={budgetValue <= MIN_REQUEST_PRICE}
          activeOpacity={0.78}
        >
          <Ionicons name="remove" size={26} color={budgetValue <= MIN_REQUEST_PRICE ? Colors.gray[400] : Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.offerPriceCenter}>
          <Text style={styles.offerPriceValue}>{budgetLabel}</Text>
          <Text style={styles.offerPriceHint}>
            {budgetHintLabel}
          </Text>
          <Text
            style={styles.offerPriceTotal}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.86}
          >
            Total estimé · {totalBudgetLabel} pour {requestSeatsLabel}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.offerPriceButton}
          onPress={() => updateBudget(budgetValue + REQUEST_PRICE_STEP)}
          activeOpacity={0.78}
        >
          <Ionicons name="add" size={26} color={Colors.gray[900]} />
        </TouchableOpacity>
      </View>

      <View style={styles.offerOptionsRow}>
        <View style={styles.offerOptionCopy}>
          <View style={styles.offerOptionIcon}>
            <Ionicons name="people" size={17} color={Colors.primary} />
          </View>
          <View style={styles.offerOptionTextBlock}>
            <Text style={styles.offerOptionLabel}>Places souhaitées</Text>
            <Text style={styles.offerOptionText}>
              {hasSpecifiedNumberOfSeats ? requestSeatsLabel : `${requestSeatsLabel} par défaut`}
            </Text>
          </View>
        </View>
        <View style={styles.counterCompact}>
          <TouchableOpacity
            style={[
              styles.counterBtnCompact,
              numberOfSeats <= MIN_REQUEST_SEATS && styles.counterBtnCompactDisabled,
            ]}
            onPress={() => {
              setHasSpecifiedNumberOfSeats(true);
              setNumberOfSeats((value) => clampRequestSeats(value - 1, seatCapacity));
            }}
            disabled={numberOfSeats <= MIN_REQUEST_SEATS}
            activeOpacity={0.75}
          >
            <Ionicons
              name="remove"
              size={18}
              color={numberOfSeats <= MIN_REQUEST_SEATS ? Colors.gray[400] : Colors.gray[900]}
            />
          </TouchableOpacity>
          <Text style={styles.counterValueCompact}>{numberOfSeats}</Text>
          <TouchableOpacity
            style={[
              styles.counterBtnCompact,
              cannotAddSeat && styles.counterBtnCompactDisabled,
            ]}
            onPress={() => {
              setHasSpecifiedNumberOfSeats(true);
              setNumberOfSeats((value) => clampRequestSeats(value + 1, seatCapacity));
            }}
            disabled={cannotAddSeat}
            activeOpacity={0.75}
          >
            <Ionicons
              name="add"
              size={18}
              color={cannotAddSeat ? Colors.gray[400] : Colors.gray[900]}
            />
          </TouchableOpacity>
        </View>
      </View>

      <PassengerSeatNotice isIdentityVerified={isIdentityVerified} capacity={seatCapacity} onVerify={() => checkIdentity('extra_seats')} />

      <View style={styles.offerPaymentBlock}>
        <Text style={styles.offerSectionLabel}>Mode de paiement</Text>
        {TRIP_PAYMENT_MODE_OPTIONS.map((option) => {
          const selected = requestPaymentMode === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.offerPaymentOption,
                selected && styles.offerPaymentOptionSelected,
              ]}
              onPress={() => setRequestPaymentMode(option.id)}
              activeOpacity={0.84}
            >
              <Ionicons
                name={option.icon}
                size={19}
                color={selected ? Colors.primary : Colors.gray[500]}
              />
              <View style={styles.offerPaymentCopy}>
                <Text style={styles.offerPaymentTitle}>{option.label}</Text>
                <Text style={styles.offerPaymentText}>{option.description}</Text>
              </View>
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={selected ? Colors.primary : Colors.gray[300]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.offerNoteToggle} onPress={() => setShowAdvanced((value) => !value)}>
        <Text style={styles.offerNoteToggleText}>{showAdvanced ? 'Masquer la note' : 'Ajouter une note'}</Text>
        <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[500]} />
      </TouchableOpacity>

      {showAdvanced && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.offerNotePanel}>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Ex: j’ai un bagage, je voyage avec un enfant..."
            placeholderTextColor={Colors.gray[400]}
          />
        </Animated.View>
      )}
    </>
  );
}
