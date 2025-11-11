import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthStep = 'phone' | 'sms' | 'kyc' | 'profile';

export default function AuthScreen() {
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState(['', '', '', '', '', '']);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [role, setRole] = useState<'driver' | 'passenger' | 'both'>('passenger');

  const progress = {
    phone: 25,
    sms: 50,
    kyc: 75,
    profile: 100,
  }[step];

  const motivationalMessage = {
    phone: '',
    sms: '🎉 Super! Continuez comme ça!',
    kyc: '⚡ Presque fini!',
    profile: '🎊 Dernière étape!',
  }[step];

  const handlePhoneSubmit = () => {
    if (phone.length >= 10) {
      setStep('sms');
    } else {
      Alert.alert('Erreur', 'Veuillez entrer un numéro valide');
    }
  };

  const handleSmsSubmit = () => {
    const code = smsCode.join('');
    if (code.length === 6) {
      setStep('kyc');
    } else {
      Alert.alert('Erreur', 'Veuillez entrer le code complet');
    }
  };

  const handleSkipKYC = () => {
    setStep('profile');
  };

  const handleKYCSubmit = () => {
    if (fullName && idNumber) {
      setStep('profile');
    } else {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
    }
  };

  const handleProfileSubmit = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header avec progression */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Inscription</Text>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
        <View style={styles.progressBar}>
          <Animated.View
            style={[styles.progressFill, { width: `${progress}%` }]}
          />
        </View>
        {motivationalMessage && (
          <Text style={styles.motivationalText}>{motivationalMessage}</Text>
        )}
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Étape 1: Numéro de téléphone */}
        {step === 'phone' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="call" size={48} color={Colors.primary} />
              </View>
              <Text style={styles.stepTitle}>Bienvenue sur ZWANGA</Text>
              <Text style={styles.stepSubtitle}>Entrez votre numéro de téléphone pour commencer</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Numéro de téléphone</Text>
              <TextInput
                style={styles.input}
                placeholder="+243 xxx xxx xxx"
                placeholderTextColor={Colors.gray[500]}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, phone.length >= 10 ? styles.buttonPrimary : styles.buttonDisabled]}
              onPress={handlePhoneSubmit}
              disabled={phone.length < 10}
            >
              <Text style={styles.buttonText}>Continuer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Étape 2: Code SMS */}
        {step === 'sms' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleYellow]}>
                <Ionicons name="chatbox" size={48} color={Colors.secondary} />
              </View>
              <Text style={styles.stepTitle}>Vérification SMS</Text>
              <Text style={styles.stepSubtitle}>
                Entrez le code à 6 chiffres envoyé au {phone}
              </Text>
            </View>

            <View style={styles.smsCodeContainer}>
              {smsCode.map((digit, index) => (
                <TextInput
                  key={index}
                  style={styles.smsInput}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(text) => {
                    const newCode = [...smsCode];
                    newCode[index] = text;
                    setSmsCode(newCode);
                  }}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.button, smsCode.join('').length === 6 ? styles.buttonPrimary : styles.buttonDisabled]}
              onPress={handleSmsSubmit}
              disabled={smsCode.join('').length !== 6}
            >
              <Text style={styles.buttonText}>Vérifier</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkText}>Renvoyer le code</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Étape 3: KYC */}
        {step === 'kyc' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleBlue]}>
                <Ionicons name="shield-checkmark" size={48} color={Colors.info} />
              </View>
              <Text style={styles.stepTitle}>Vérification d'identité</Text>
              <Text style={styles.stepSubtitle}>
                Pour votre sécurité et celle des autres utilisateurs
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nom complet</Text>
              <TextInput
                style={styles.input}
                placeholder="Jean Mukendi"
                placeholderTextColor={Colors.gray[500]}
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={[styles.inputGroup, { marginBottom: Spacing.xl }]}>
              <Text style={styles.label}>Numéro de carte d'identité</Text>
              <TextInput
                style={styles.input}
                placeholder="1-XXXX-XXXXXXX-XX"
                placeholderTextColor={Colors.gray[500]}
                value={idNumber}
                onChangeText={setIdNumber}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleKYCSubmit}
            >
              <Text style={styles.buttonText}>Continuer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleSkipKYC}
            >
              <Text style={styles.buttonSecondaryText}>Passer cette étape</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Étape 4: Configuration du profil */}
        {step === 'profile' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleGreen]}>
                <Ionicons name="person" size={48} color={Colors.success} />
              </View>
              <Text style={styles.stepTitle}>Configuration du profil</Text>
              <Text style={styles.stepSubtitle}>
                Dites-nous comment vous utiliserez ZWANGA
              </Text>
            </View>

            <View style={styles.roleContainer}>
              <Text style={styles.label}>Je souhaite être:</Text>
              
              <TouchableOpacity
                style={[styles.roleCard, role === 'passenger' && styles.roleCardActive]}
                onPress={() => setRole('passenger')}
              >
                <View style={[styles.roleIcon, role === 'passenger' && styles.roleIconActive]}>
                  <Ionicons name="person" size={24} color={role === 'passenger' ? Colors.white : Colors.gray[600]} />
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleTitle}>Passager</Text>
                  <Text style={styles.roleSubtitle}>Je cherche des trajets</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, role === 'driver' && styles.roleCardActive]}
                onPress={() => setRole('driver')}
              >
                <View style={[styles.roleIcon, role === 'driver' && styles.roleIconActive]}>
                  <Ionicons name="car" size={24} color={role === 'driver' ? Colors.white : Colors.gray[600]} />
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleTitle}>Conducteur</Text>
                  <Text style={styles.roleSubtitle}>Je propose des trajets</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, role === 'both' && styles.roleCardActive, { marginBottom: Spacing.xl }]}
                onPress={() => setRole('both')}
              >
                <View style={[styles.roleIcon, role === 'both' && styles.roleIconActive]}>
                  <Ionicons name="swap-horizontal" size={24} color={role === 'both' ? Colors.white : Colors.gray[600]} />
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleTitle}>Les deux</Text>
                  <Text style={styles.roleSubtitle}>Je propose et je cherche des trajets</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleProfileSubmit}
            >
              <Text style={styles.buttonText}>Terminer</Text>
            </TouchableOpacity>
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  progressText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  motivationalText: {
    fontSize: FontSizes.sm,
    color: Colors.success,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  stepContainer: {
    marginTop: Spacing.xxl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  iconCircleYellow: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
  },
  iconCircleBlue: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
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
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  button: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: Colors.primary,
  },
  buttonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    marginTop: Spacing.md,
  },
  buttonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  buttonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  buttonSecondaryText: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  smsCodeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxl,
  },
  smsInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    textAlign: 'center',
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  linkButton: {
    paddingVertical: Spacing.md,
  },
  linkText: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  roleContainer: {
    marginBottom: Spacing.xl,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255, 107, 53, 0.05)',
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    backgroundColor: Colors.gray[200],
  },
  roleIconActive: {
    backgroundColor: Colors.primary,
  },
  roleContent: {
    flex: 1,
  },
  roleTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.xs,
    fontSize: FontSizes.base,
  },
  roleSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
});
