import { Colors, Spacing } from '@/constants/styles';
import { useDialog } from '@/components/ui/DialogProvider';
import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
    const { showDialog } = useDialog();
    const { source } = useLocalSearchParams<{ source?: string }>();
    const normalizedSource = Array.isArray(source) ? source[0] : source;
    const isExtraSeatsVerification = normalizedSource === 'extra_seats';
    const isPassengerVerification = normalizedSource === 'book' || normalizedSource === 'request' || isExtraSeatsVerification;
    const passengerActionLabel = normalizedSource === 'request' ? 'demande de trajet' : 'réservation';
    const heroTitle = 'Vérifier mon identité';
    const heroSubtitle = isExtraSeatsVerification
        ? 'Pour réserver 3 places ou plus, vérifiez votre identité. Vous restez passager : aucun véhicule à ajouter.'
        : isPassengerVerification
        ? "Ce trajet exige des passagers vérifiés. Cette étape confirme uniquement votre identité : aucun véhicule n'est demandé."
        : 'Lancez une vérification sécurisée avec Didit pour augmenter la confiance de votre profil.';
    const benefits = isPassengerVerification
        ? [
            isExtraSeatsVerification ? 'Réserver 3 places ou plus, selon les places disponibles' : 'Accès aux trajets qui exigent des passagers vérifiés',
            'Badge « Vérifié » sur votre profil',
            'Aucun véhicule requis pour ce parcours passager',
        ]
        : [
            'Badge « Vérifié » sur votre profil',
            'Vérification guidée et hébergée par Didit',
            'Plus de confiance des membres',
        ];
    const { startDiditKyc, isStartingDiditKyc } = useDiditKycFlow({
        sourceScreen: isPassengerVerification ? `passenger_${normalizedSource}_verification` : 'verification',
        approvedMessage:
            isPassengerVerification
                ? `Votre identité a été vérifiée avec succès. Vous pouvez revenir à votre ${passengerActionLabel} et continuer.`
                : 'Votre identité est vérifiée. Vous pouvez réserver 3 places ou plus et accéder aux trajets réservés aux passagers vérifiés.',
        pendingMessage:
            isPassengerVerification
                ? 'Votre vérification Didit est en cours. Vous serez informé dès que le contrôle sera terminé.'
                : 'Votre vérification Didit est en cours. Nous vous informerons dès que le contrôle sera terminé.',
    });

    const handleStartKyc = async () => {
        const outcome = await startDiditKyc({ showResultDialog: !isPassengerVerification });
        if (outcome) {
            if (isPassengerVerification) {
                // Return only after dismissing the result dialog, before restoring a native form modal.
                showDialog({
                    title: outcome.status === 'approved' ? 'Identité vérifiée' : outcome.status === 'pending' ? 'Vérification en cours' : 'Vérification non terminée',
                    message: outcome.status === 'approved'
                        ? 'Vous pouvez revenir au formulaire et continuer.'
                        : outcome.status === 'pending'
                            ? 'Vos documents sont en cours de vérification. Vous pourrez continuer une fois votre identité validée.'
                            : 'Votre identité n’a pas encore été validée. Vous pouvez reprendre la vérification.',
                    variant: outcome.status === 'approved' ? 'success' : 'info',
                    actions: [
                        { label: 'Revenir au formulaire', variant: 'primary', onPress: handleSkip },
                        ...(outcome.status === 'rejected' || !outcome.status
                            ? [{ label: 'Réessayer', variant: 'secondary' as const, onPress: handleStartKyc }]
                            : []),
                    ],
                });
                return;
            }
            router.replace('/(tabs)');
        }
    };

    const handleSkip = () => {
        if (isPassengerVerification && router.canGoBack()) {
            router.back();
            return;
        }

        router.replace('/(tabs)');
    };

    return (
        <SafeAreaView style={styles.container}>
            <Animated.View entering={FadeInDown.springify()} style={styles.content}>
                <View style={styles.heroSection}>
                    <View style={[styles.logoContainer, { backgroundColor: Colors.info + '15' }]}>
                        <Ionicons name="shield-checkmark" size={48} color={Colors.info} />
                    </View>
                    <Text style={styles.heroTitle}>{heroTitle}</Text>
                    <Text style={styles.heroSubtitle}>
                        {heroSubtitle}
                    </Text>
                </View>

                <View style={styles.kycBenefitsContainer}>
                    <View style={styles.benefitRow}>
                        <Ionicons name="checkbox" size={24} color={Colors.success} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>{benefits[0]}</Text>
                    </View>
                    <View style={styles.benefitRow}>
                        <Ionicons name="flash" size={24} color={Colors.warning} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>{benefits[1]}</Text>
                    </View>
                    <View style={styles.benefitRow}>
                        <Ionicons name="heart" size={24} color={Colors.danger} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>{benefits[2]}</Text>
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
    benefitText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.gray[800] },

    actions: { gap: 16, marginBottom: Spacing.xl },
    mainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, gap: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    mainButtonActive: { backgroundColor: Colors.primary },
    mainButtonDisabled: { opacity: 0.7 },
    mainButtonText: { fontSize: 18, fontWeight: '700', color: 'white' },
    resendButton: { alignSelf: 'center', padding: 8 },
    resendButtonText: { fontWeight: '600' },
});
