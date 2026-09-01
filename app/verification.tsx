import { Colors, Spacing } from '@/constants/styles';
import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerificationScreen() {
    const router = useRouter();
    const { startDiditKyc, isStartingDiditKyc } = useDiditKycFlow({
        sourceScreen: 'verification',
        approvedMessage:
            "Votre identité a été vérifiée avec succès. Vous pouvez maintenant utiliser toutes les fonctionnalités de l'application.",
        pendingMessage:
            'Votre vérification Didit est en cours. Nous vous informerons dès que le contrôle sera terminé.',
    });

    const handleStartKyc = async () => {
        const outcome = await startDiditKyc();
        if (outcome) {
            router.replace('/(tabs)');
        }
    };

    const handleSkip = () => {
        router.replace('/(tabs)');
    };

    return (
        <SafeAreaView style={styles.container}>
            <Animated.View entering={FadeInDown.springify()} style={styles.content}>
                <View style={styles.heroSection}>
                    <View style={[styles.logoContainer, { backgroundColor: Colors.info + '15' }]}>
                        <Ionicons name="shield-checkmark" size={48} color={Colors.info} />
                    </View>
                    <Text style={styles.heroTitle}>Identité vérifiée</Text>
                    <Text style={styles.heroSubtitle}>
                        Lancez une vérification sécurisée avec Didit pour augmenter la confiance de votre profil.
                    </Text>
                </View>

                <View style={styles.kycBenefitsContainer}>
                    <View style={styles.benefitRow}>
                        <Ionicons name="checkbox" size={24} color={Colors.success} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>Badge « Vérifié » sur votre profil</Text>
                    </View>
                    <View style={styles.benefitRow}>
                        <Ionicons name="flash" size={24} color={Colors.warning} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>Vérification guidée et hébergée par Didit</Text>
                    </View>
                    <View style={styles.benefitRow}>
                        <Ionicons name="heart" size={24} color={Colors.danger} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>Plus de confiance des membres</Text>
                    </View>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.mainButton, styles.mainButtonActive, isStartingDiditKyc && styles.mainButtonDisabled]}
                        onPress={handleStartKyc}
                        disabled={isStartingDiditKyc}
                    >
                        {isStartingDiditKyc ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <Text style={styles.mainButtonText}>Vérifier avec Didit</Text>
                                <Ionicons name="scan" size={20} color="white" />
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.resendButton} onPress={handleSkip}>
                        <Text style={[styles.resendButtonText, { color: Colors.gray[500] }]}>Faire plus tard</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.white, padding: Spacing.xl },
    content: { flex: 1, justifyContent: 'space-between' },

    heroSection: { alignItems: 'center', marginTop: Spacing.xl * 2 },
    logoContainer: { width: 80, height: 80, borderRadius: 25, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
    heroTitle: { fontSize: 28, fontWeight: '800', color: Colors.gray[900], marginBottom: 4, textAlign: 'center' },
    heroSubtitle: { fontSize: 16, color: Colors.gray[500], textAlign: 'center', paddingHorizontal: 20 },

    kycBenefitsContainer: { gap: 16, marginVertical: 32 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16 },
    benefitText: { fontSize: 15, fontWeight: '600', color: Colors.gray[800] },

    actions: { gap: 16, marginBottom: Spacing.xl },
    mainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, gap: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    mainButtonActive: { backgroundColor: Colors.primary },
    mainButtonDisabled: { opacity: 0.7 },
    mainButtonText: { fontSize: 18, fontWeight: '700', color: 'white' },
    resendButton: { alignSelf: 'center', padding: 8 },
    resendButtonText: { fontWeight: '600' },
});