import { PublishStep } from './publishModel';
import { styles } from '../screen-styles/app/publish/index';
import { Colors, Spacing } from '@/constants/styles';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface PublishPricingStepProps {
  stepEntering: FadeInDown | undefined;
  setSeats: React.Dispatch<React.SetStateAction<string>>;
  seats: string;
  isFreeTrip: boolean;
  price: string;
  setPrice: React.Dispatch<React.SetStateAction<string>>;
  setIsFreeTrip: React.Dispatch<React.SetStateAction<boolean>>;
  requiresPassengerKyc: boolean;
  setRequiresPassengerKyc: React.Dispatch<React.SetStateAction<boolean>>;
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
  insets: EdgeInsets;
  goToStep: (nextStep: PublishStep) => void;
  handleNextStep: () => void;
}

export function PublishPricingStep({
  stepEntering,
  setSeats,
  seats,
  isFreeTrip,
  price,
  setPrice,
  setIsFreeTrip,
  requiresPassengerKyc,
  setRequiresPassengerKyc,
  description,
  setDescription,
  insets,
  goToStep,
  handleNextStep,
}: PublishPricingStepProps) {
  return (
    <Animated.View entering={stepEntering} style={styles.stepContainer}>
      <Text style={styles.sectionTitle}>Places et prix</Text>

      <View style={styles.row}>
        <View style={[styles.card, { flex: 1, marginRight: Spacing.sm }]}>
          <Text style={styles.cardLabel}>PLACES</Text>
          <View style={styles.counterContainer}>
            <TouchableOpacity
              onPress={() => setSeats(Math.max(1, parseInt(seats || '1') - 1).toString())}
              style={styles.counterBtn}
            >
              <Ionicons name="remove" size={20} color={Colors.gray[900]} />
            </TouchableOpacity>
            <Text style={styles.counterValue}>{seats}</Text>
            <TouchableOpacity
              onPress={() => setSeats((parseInt(seats || '1') + 1).toString())}
              style={styles.counterBtn}
            >
              <Ionicons name="add" size={20} color={Colors.gray[900]} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.card, { flex: 1.5 }]}>
          <Text style={styles.cardLabel}>PRIX PAR PLACE (FC)</Text>
          <View style={styles.priceInputContainer}>
            <TextInput
              style={styles.priceInput}
              placeholder={isFreeTrip ? "Gratuit" : "Ex: 2000"}
              keyboardType="number-pad"
              value={price}
              onChangeText={setPrice}
              editable={!isFreeTrip}
            />
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.card, styles.freeTripCard]}
        onPress={() => {
          setIsFreeTrip(!isFreeTrip);
          if (!isFreeTrip) {
            setPrice('');
          }
        }}
        activeOpacity={0.8}
      >
        <View style={styles.freeTripContent}>
          <Text style={styles.freeTripTitle}>
            Trajet gratuit
          </Text>
          <Text style={styles.freeTripSubtitle}>
            Proposer ce trajet gratuitement aux passagers
          </Text>
        </View>
        <View style={[styles.toggleSwitch, isFreeTrip && styles.toggleSwitchActive]}>
          <View style={[styles.toggleThumb, isFreeTrip && styles.toggleThumbActive]} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.card,
          styles.passengerKycRequirementCard,
          requiresPassengerKyc && styles.passengerKycRequirementCardActive,
        ]}
        onPress={() => setRequiresPassengerKyc((current) => !current)}
        activeOpacity={0.84}
      >
        <View style={styles.passengerKycRequirementContent}>
          <View
            style={[
              styles.passengerKycRequirementIcon,
              requiresPassengerKyc && styles.passengerKycRequirementIconActive,
            ]}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={requiresPassengerKyc ? Colors.white : Colors.primary}
            />
          </View>
          <View style={styles.passengerKycRequirementCopy}>
            <Text style={styles.freeTripTitle}>Passagers vérifiés uniquement</Text>
            <Text style={styles.freeTripSubtitle}>
              L’identité des passagers devra être vérifiée avant de réserver ou d’embarquer.
            </Text>
          </View>
        </View>
        <View style={[styles.toggleSwitch, requiresPassengerKyc && styles.toggleSwitchActive]}>
          <View style={[styles.toggleThumb, requiresPassengerKyc && styles.toggleThumbActive]} />
        </View>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>DESCRIPTION (OPTIONNEL)</Text>
        <TextInput
          style={styles.textAreaCard}
          placeholder="Ajoutez des informations supplémentaires (ex: bagages acceptés, point de rendez-vous, etc.)"
          placeholderTextColor={Colors.gray[400]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
        <Text style={styles.infoText}>
          Les passagers verront ces informations avant de réserver leur place.
        </Text>
      </View>

      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => goToStep('vehicle')}
        >
          <Text style={styles.buttonSecondaryText}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handleNextStep}>
          <Text style={styles.buttonText}>Continuer</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
