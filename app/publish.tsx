import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppDispatch } from '@/store/hooks';
import { addTrip } from '@/store/slices/tripsSlice';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';

type PublishStep = 'route' | 'details' | 'confirm';

export default function PublishScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { checkIdentity } = useIdentityCheck();
  const [step, setStep] = useState<PublishStep>('route');

  // Données du formulaire
  const [departure, setDeparture] = useState('');
  const [departureAddress, setDepartureAddress] = useState('');
  const [arrival, setArrival] = useState('');
  const [arrivalAddress, setArrivalAddress] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [seats, setSeats] = useState('4');
  const [price, setPrice] = useState('');

  const handleNextStep = () => {
    if (step === 'route') {
      if (!departure || !arrival) {
        Alert.alert('Erreur', 'Veuillez remplir les champs obligatoires');
        return;
      }
      // Vérifier l'identité avant de continuer
      if (!checkIdentity('publish')) {
        return;
      }
      setStep('details');
    } else if (step === 'details') {
      if (!departureTime || !price) {
        Alert.alert('Erreur', 'Veuillez remplir tous les détails');
        return;
      }
      setStep('confirm');
    }
  };

  const handlePublish = () => {
    const newTrip = {
      id: Date.now().toString(),
      driverId: 'current-user',
      driverName: 'Jean Mukendi',
      driverRating: 4.8,
      vehicleType: 'car' as const,
      vehicleInfo: 'Toyota Corolla blanche',
      departure: {
        name: departure,
        address: departureAddress,
        lat: -4.3276,
        lng: 15.3222,
      },
      arrival: {
        name: arrival,
        address: arrivalAddress,
        lat: -4.4040,
        lng: 15.2821,
      },
      departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      arrivalTime: new Date(Date.now() + 2.5 * 60 * 60 * 1000),
      price: parseInt(price),
      availableSeats: parseInt(seats),
      totalSeats: parseInt(seats),
      status: 'upcoming' as const,
    };

    dispatch(addTrip(newTrip));
    Alert.alert('Succès', 'Votre trajet a été publié avec succès!', [
      { text: 'OK', onPress: () => router.back() }
    ]);
  };

  const progressWidth = step === 'route' ? '33%' : step === 'details' ? '66%' : '100%';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Publier un trajet</Text>
          <Text style={styles.headerSubtitle}>
            Étape {step === 'route' ? '1' : step === 'details' ? '2' : '3'}/3
          </Text>
        </View>
      </View>

      {/* Barre de progression */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Étape 1: Itinéraire */}
        {step === 'route' && (
          <Animated.View entering={FadeInDown} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="map" size={40} color={Colors.primary} />
              </View>
              <Text style={styles.stepTitle}>Votre itinéraire</Text>
              <Text style={styles.stepSubtitle}>
                Indiquez le point de départ et d'arrivée
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Point de départ *</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="location" size={20} color={Colors.success} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Gombe"
                  placeholderTextColor={Colors.gray[500]}
                  value={departure}
                  onChangeText={setDeparture}
                />
              </View>
              <TextInput
                style={[styles.input, styles.inputSmall]}
                placeholder="Adresse précise (optionnel)"
                placeholderTextColor={Colors.gray[500]}
                value={departureAddress}
                onChangeText={setDepartureAddress}
              />
            </View>

            <View style={[styles.inputGroup, { marginBottom: Spacing.xl }]}>
              <Text style={styles.label}>Destination *</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="navigate" size={20} color={Colors.primary} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Lemba"
                  placeholderTextColor={Colors.gray[500]}
                  value={arrival}
                  onChangeText={setArrival}
                />
              </View>
              <TextInput
                style={[styles.input, styles.inputSmall]}
                placeholder="Adresse précise (optionnel)"
                placeholderTextColor={Colors.gray[500]}
                value={arrivalAddress}
                onChangeText={setArrivalAddress}
              />
            </View>

            <TouchableOpacity style={styles.button} onPress={handleNextStep}>
              <Text style={styles.buttonText}>Continuer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Étape 2: Détails */}
        {step === 'details' && (
          <Animated.View entering={FadeInDown} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleYellow]}>
                <Ionicons name="information-circle" size={40} color={Colors.secondary} />
              </View>
              <Text style={styles.stepTitle}>Détails du trajet</Text>
              <Text style={styles.stepSubtitle}>
                Complétez les informations
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Heure de départ *</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="time" size={20} color={Colors.gray[600]} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 14:00"
                  placeholderTextColor={Colors.gray[500]}
                  value={departureTime}
                  onChangeText={setDepartureTime}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nombre de places *</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="people" size={20} color={Colors.gray[600]} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 3"
                  keyboardType="number-pad"
                  value={seats}
                  onChangeText={setSeats}
                />
              </View>
            </View>

            <View style={[styles.inputGroup, { marginBottom: Spacing.xl }]}>
              <Text style={styles.label}>Prix par personne (FC) *</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="cash" size={20} color={Colors.gray[600]} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 2000"
                  keyboardType="number-pad"
                  value={price}
                  onChangeText={setPrice}
                />
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setStep('route')}
              >
                <Text style={styles.buttonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handleNextStep}>
                <Text style={styles.buttonText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Étape 3: Confirmation */}
        {step === 'confirm' && (
          <Animated.View entering={FadeInDown} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleGreen]}>
                <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
              </View>
              <Text style={styles.stepTitle}>Confirmation</Text>
              <Text style={styles.stepSubtitle}>
                Vérifiez les informations avant de publier
              </Text>
            </View>

            <View style={styles.confirmCard}>
              {/* Itinéraire */}
              <View style={styles.confirmSection}>
                <Text style={styles.confirmSectionTitle}>ITINÉRAIRE</Text>
                <View style={styles.confirmRoute}>
                  <View style={styles.confirmRouteRow}>
                    <Ionicons name="location" size={20} color={Colors.success} />
                    <View style={styles.confirmRouteContent}>
                      <Text style={styles.confirmRouteName}>{departure}</Text>
                      {departureAddress && <Text style={styles.confirmRouteAddress}>{departureAddress}</Text>}
                    </View>
                  </View>
                  <View style={styles.confirmRouteDivider} />
                  <View style={styles.confirmRouteRow}>
                    <Ionicons name="navigate" size={20} color={Colors.primary} />
                    <View style={styles.confirmRouteContent}>
                      <Text style={styles.confirmRouteName}>{arrival}</Text>
                      {arrivalAddress && <Text style={styles.confirmRouteAddress}>{arrivalAddress}</Text>}
                    </View>
                  </View>
                </View>
              </View>

              {/* Détails */}
              <View>
                <Text style={styles.confirmSectionTitle}>DÉTAILS</Text>
                <View style={styles.confirmDetails}>
                  <View style={styles.confirmDetailRow}>
                    <View style={styles.confirmDetailLeft}>
                      <Ionicons name="time" size={18} color={Colors.gray[600]} />
                      <Text style={styles.confirmDetailLabel}>Heure de départ</Text>
                    </View>
                    <Text style={styles.confirmDetailValue}>{departureTime}</Text>
                  </View>
                  <View style={styles.confirmDetailRow}>
                    <View style={styles.confirmDetailLeft}>
                      <Ionicons name="people" size={18} color={Colors.gray[600]} />
                      <Text style={styles.confirmDetailLabel}>Places</Text>
                    </View>
                    <Text style={styles.confirmDetailValue}>{seats}</Text>
                  </View>
                  <View style={styles.confirmDetailRow}>
                    <View style={styles.confirmDetailLeft}>
                      <Ionicons name="cash" size={18} color={Colors.gray[600]} />
                      <Text style={styles.confirmDetailLabel}>Prix</Text>
                    </View>
                    <Text style={[styles.confirmDetailValue, { color: Colors.success }]}>{price} FC/pers</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setStep('details')}
              >
                <Text style={styles.buttonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handlePublish}>
                <Text style={styles.buttonText}>Publier</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  closeButton: {
    marginRight: Spacing.lg,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.gray[200],
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  stepContainer: {
    marginTop: Spacing.xl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  iconCircleYellow: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
  },
  iconCircleGreen: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  stepTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    color: Colors.gray[600],
    textAlign: 'center',
    fontSize: FontSizes.base,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  input: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  inputSmall: {
    fontSize: FontSizes.sm,
    paddingVertical: Spacing.md,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  buttonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  buttonSecondaryText: {
    color: Colors.gray[700],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  confirmCard: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  confirmSection: {
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  confirmSectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  confirmRoute: {
    marginTop: Spacing.md,
  },
  confirmRouteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  confirmRouteContent: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  confirmRouteName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  confirmRouteAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  confirmRouteDivider: {
    width: 2,
    height: 32,
    backgroundColor: Colors.gray[300],
    marginLeft: 10,
    marginBottom: Spacing.md,
  },
  confirmDetails: {
    marginTop: Spacing.md,
  },
  confirmDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  confirmDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmDetailLabel: {
    color: Colors.gray[700],
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
  },
  confirmDetailValue: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
});
