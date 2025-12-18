import { KycCaptureResult, KycWizardModal } from '@/components/KycWizardModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors, Spacing } from '@/constants/styles';
import { useUploadKycMutation } from '@/store/api/userApi';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerificationScreen() {
    const router = useRouter();
    const { showDialog } = useDialog();
    const [uploadKyc] = useUploadKycMutation();

    console.log('[VerificationScreen] Rendering...');


    const [kycModalVisible, setKycModalVisible] = useState(false);
    const [kycSubmitting, setKycSubmitting] = useState(false);

    const buildKycFormData = (files: KycCaptureResult) => {
        const formData = new FormData();
        const appendFile = (field: string, uri: string) => {
            const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
            formData.append(field, {
                uri,
                type: 'image/jpeg',
                name: `${field}-${Date.now()}.${ext}`,
            } as any);
        };
        appendFile('cniFront', files.front);
        appendFile('cniBack', files.back);
        appendFile('selfie', files.selfie);
        return formData;
    };

    const handleKycWizardComplete = async (payload: KycCaptureResult) => {
        setKycModalVisible(false);
        try {
            setKycSubmitting(true);
            const formData = buildKycFormData(payload);
            const result = await uploadKyc(formData).unwrap();
            
            // Vérifier le statut retourné par le backend
            const kycStatusAfterUpload = result?.status;
            
            if (kycStatusAfterUpload === 'approved') {
                // KYC approuvé immédiatement (validation automatique réussie)
                showDialog({
                    variant: 'success',
                    title: 'KYC validé avec succès !',
                    message: 'Votre identité a été vérifiée automatiquement. Vous pouvez maintenant utiliser toutes les fonctionnalités de l\'application.',
                });
                router.replace('/(tabs)');
            } else if (kycStatusAfterUpload === 'rejected') {
                // KYC rejeté (validation automatique échouée)
                const rejectionReason = result?.rejectionReason || 'Votre demande KYC a été rejetée.';
                showDialog({
                    variant: 'danger',
                    title: 'KYC rejeté',
                    message: rejectionReason,
                });
                // Ne pas rediriger, laisser l'utilisateur réessayer
            } else {
                // KYC en attente (validation manuelle requise)
                showDialog({
                    variant: 'success',
                    title: 'Vérification envoyée',
                    message: 'Vos documents sont en cours de vérification. Nous vous informerons dès que la vérification sera terminée.',
                });
                router.replace('/(tabs)');
            }
        } catch (error: any) {
            // Gérer les erreurs détaillées du backend
            let errorMessage = error?.data?.message ?? error?.error ?? 'Erreur lors de l\'envoi des documents.';
            
            // Si le message est une chaîne, la traiter directement
            if (typeof errorMessage === 'string') {
                // Le backend peut retourner des messages multi-lignes avec des détails
                errorMessage = errorMessage;
            } else if (Array.isArray(errorMessage)) {
                errorMessage = errorMessage.join('\n');
            }
            
            showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: errorMessage,
            });
            // Ne pas rediriger en cas d'erreur, laisser l'utilisateur réessayer
        } finally {
            setKycSubmitting(false);
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
                        Augmentez la confiance de votre profil.
                    </Text>
                </View>

                <View style={styles.kycBenefitsContainer}>
                    <View style={styles.benefitRow}>
                        <Ionicons name="checkbox" size={24} color={Colors.success} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>Badge "Vérifié" sur votre profil</Text>
                    </View>
                    <View style={styles.benefitRow}>
                        <Ionicons name="flash" size={24} color={Colors.warning} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>Accès prioritaire aux trajets</Text>
                    </View>
                    <View style={styles.benefitRow}>
                        <Ionicons name="heart" size={24} color={Colors.danger} style={{ marginBottom: 2 }} />
                        <Text style={styles.benefitText}>Plus de confiance des membres</Text>
                    </View>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity style={[styles.mainButton, styles.mainButtonActive]} onPress={() => setKycModalVisible(true)}>
                        <Text style={styles.mainButtonText}>Vérifier maintenant</Text>
                        <Ionicons name="scan" size={20} color="white" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.resendButton} onPress={handleSkip}>
                        <Text style={[styles.resendButtonText, { color: Colors.gray[500] }]}>Faire plus tard</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <KycWizardModal
                visible={kycModalVisible}
                onClose={() => setKycModalVisible(false)}
                onComplete={handleKycWizardComplete}
                isSubmitting={kycSubmitting}
            />
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
    mainButtonText: { fontSize: 18, fontWeight: '700', color: 'white' },
    resendButton: { alignSelf: 'center', padding: 8 },
    resendButtonText: { fontWeight: '600' },
});
