import { useDialog } from '@/components/ui/DialogProvider';
import { Colors, Spacing } from '@/constants/styles';
import { useGetMyReferralSummaryQuery } from '@/store/api/referralApi';
import {
    buildReferralShareMessage,
    normalizeReferralShareLink,
    shareReferralLink,
} from '@/utils/shareReferralLink';
import { Ionicons } from '@expo/vector-icons';
import type { Contact } from 'expo-contacts';
import { useInviteContacts } from '@/hooks/invite/useInviteContacts';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function InviteScreen() {
    const router = useRouter();
    const { showDialog } = useDialog();
    const active = useScreenIsActive();
    const enabled = useDisplayReadsEnabled(active);
    const contacts = useInviteContacts(active);
    const [isSharing, setIsSharing] = useState(false);
    const {
        data: referralSummary,
        isFetching: isReferralFetching,
        refetch: refetchReferralSummary,
    } = useGetMyReferralSummaryQuery(undefined, displayReadOptions(enabled));

    const getReferralLink = async () => {
        const existingLink = normalizeReferralShareLink(referralSummary?.shareLink);
        if (existingLink) return existingLink;
        if (!enabled) throw new Error('Connectez-vous à Internet pour récupérer votre lien.');
        const refreshed = await refetchReferralSummary().unwrap();
        const refreshedLink = normalizeReferralShareLink(refreshed.shareLink);
        if (!refreshedLink) {
            throw new Error("Le lien d'invitation n'est pas encore disponible.");
        }
        return refreshedLink;
    };

    const handleShare = async () => {
        if (isSharing) return;
        setIsSharing(true);
        try {
            await shareReferralLink(await getReferralLink());
        } catch (error) {
            showDialog({
                variant: 'danger',
                title: 'Partage indisponible',
                message:
                    error instanceof Error
                        ? error.message
                        : "Impossible de preparer le lien d'invitation.",
            });
        } finally {
            setIsSharing(false);
        }
    };

    const handleInvite = async (contact: Contact) => {
        if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) return;

        // Pick the first mobile number or just the first number
        const phoneNumber = contact.phoneNumbers[0].number;
        const cleanNumber = phoneNumber?.replace(/\D/g, ''); // keep only digits? WhatsApp usually handles + but let's be safe or just pass as is. 
        // Actually whatsapp uses international format without + or 00. 
        // But for "send" intent, usually mostly clean digits works. 

        try {
            const message = `Salut ! ${buildReferralShareMessage(await getReferralLink())}`;
            const url = `whatsapp://send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
            const supported = await Linking.canOpenURL(url);
            if (supported) {
                await Linking.openURL(url);
            } else {
                // Fallback to SMS if WhatsApp is not installed?
                const smsUrl = `sms:${phoneNumber}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;
                await Linking.openURL(smsUrl);
            }
        } catch (error) {
            showDialog({
                variant: 'danger',
                title: 'Invitation impossible',
                message:
                    error instanceof Error
                        ? error.message
                        : "Impossible de preparer le lien d'invitation.",
            });
        }
    };

    if (contacts.permission && contacts.permission !== 'granted') {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
                    </TouchableOpacity>
                </View>
                <View style={styles.permissionContainer}>
                    <Ionicons name="people" size={64} color={Colors.gray[300]} />
                    <Text style={styles.permissionTitle}>Accès aux contacts requis</Text>
                    <Text style={styles.permissionText}>Pour inviter vos amis, veuillez autoriser Zwanga à accéder à vos contacts.</Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={Linking.openSettings}>
                        <Text style={styles.permissionButtonText}>Ouvrir les paramètres</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.permissionShareButton}
                        onPress={handleShare}
                        disabled={isSharing || isReferralFetching}
                    >
                        {isSharing || isReferralFetching ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                            <Ionicons name="share-social-outline" size={20} color={Colors.primary} />
                        )}
                        <Text style={styles.permissionShareButtonText}>Partager sans les contacts</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Inviter des amis</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.referralCard}>
                <View style={styles.referralCopy}>
                    <Text style={styles.referralEyebrow}>VOTRE LIEN PERSONNEL</Text>
                    <Text style={styles.referralLinkTitle}>Invitation automatique</Text>
                    <Text style={styles.referralHint}>Aucun code à saisir après l’installation.</Text>
                </View>
                <TouchableOpacity
                    style={[styles.shareButton, (isSharing || isReferralFetching) && styles.disabled]}
                    onPress={handleShare}
                    disabled={isSharing || isReferralFetching}
                    accessibilityRole="button"
                    accessibilityLabel="Partager mon lien de parrainage"
                >
                    {isSharing || isReferralFetching ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                        <Ionicons name="share-social-outline" size={20} color={Colors.white} />
                    )}
                </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={Colors.gray[500]} style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Rechercher un contact..."
                    value={contacts.search}
                    onChangeText={contacts.changeSearch}
                    placeholderTextColor={Colors.gray[400]}
                />
            </View>

            <FlatList
                key={`${contacts.search}:${contacts.pageNumber}`}
                data={contacts.contacts}
                keyExtractor={(item, index) => item.id ?? `${item.name}:${item.phoneNumbers?.[0]?.number}:${index}`}
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={5}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.contactItem} onPress={() => handleInvite(item)}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{item.name?.charAt(0) || '?'}</Text>
                        </View>
                        <View style={styles.contactInfo}>
                            <Text style={styles.contactName}>{item.name}</Text>
                            <Text style={styles.contactPhone}>{item.phoneNumbers?.[0]?.number}</Text>
                        </View>
                        <View style={styles.inviteButton}>
                            <Text style={styles.inviteButtonText}>Inviter</Text>
                        </View>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        {contacts.loading ? <>
                            <ActivityIndicator color={Colors.primary} />
                            <Text style={styles.emptyText}>{contacts.search ? 'Recherche dans vos contacts…' : 'Chargement des contacts…'}</Text>
                        </> : contacts.error ? <>
                            <Text style={styles.emptyText}>Impossible de lire les contacts.</Text>
                            <TouchableOpacity onPress={contacts.retry} style={styles.permissionShareButton} accessibilityRole="button">
                                <Text style={styles.permissionShareButtonText}>Réessayer</Text>
                            </TouchableOpacity>
                        </> : <Text style={styles.emptyText}>Aucun contact trouvé</Text>}
                    </View>
                }
                ListFooterComponent={contacts.hasPrevious || contacts.hasNext ? <View style={styles.pagination}>
                    <TouchableOpacity onPress={contacts.previous} disabled={!contacts.hasPrevious || contacts.loading}
                        style={[styles.pageButton, (!contacts.hasPrevious || contacts.loading) && styles.disabled]} accessibilityRole="button">
                        <Text style={styles.permissionShareButtonText}>Précédent</Text>
                    </TouchableOpacity>
                    <Text style={styles.emptyText}>Page {contacts.pageNumber}</Text>
                    <TouchableOpacity onPress={contacts.next} disabled={!contacts.hasNext || contacts.loading}
                        style={[styles.pageButton, (!contacts.hasNext || contacts.loading) && styles.disabled]} accessibilityRole="button">
                        <Text style={styles.permissionShareButtonText}>Suivant</Text>
                    </TouchableOpacity>
                </View> : null}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.white },
    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
    pageButton: { paddingVertical: 12, paddingHorizontal: 8 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
    backButton: { padding: 4, borderRadius: 20 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray[900] },

    referralCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, borderRadius: 16, backgroundColor: Colors.primary, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    referralCopy: { flex: 1 },
    referralEyebrow: { color: '#FFE1D6', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    referralLinkTitle: { color: Colors.white, fontSize: 18, fontWeight: '800', marginTop: 3 },
    referralHint: { color: '#FFF4EF', fontSize: 12, marginTop: 4 },
    shareButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center' },

    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[100], margin: Spacing.lg, paddingHorizontal: Spacing.md, borderRadius: 12, height: 48 },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 16, color: Colors.gray[900] },

    listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 20 },
    contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[50] },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    avatarText: { fontSize: 18, fontWeight: '700', color: Colors.primary },
    contactInfo: { flex: 1 },
    contactName: { fontSize: 16, fontWeight: '600', color: Colors.gray[900] },
    contactPhone: { fontSize: 14, color: Colors.gray[500], marginTop: 2 },

    inviteButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.success + '10', borderRadius: 20 },
    inviteButtonText: { fontSize: 12, fontWeight: '600', color: Colors.success },

    permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: 16 },
    permissionTitle: { fontSize: 20, fontWeight: '700', color: Colors.gray[900] },
    permissionText: { textAlign: 'center', color: Colors.gray[600], lineHeight: 22 },
    permissionButton: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
    permissionButtonText: { color: 'white', fontWeight: '600' },
    permissionShareButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    permissionShareButtonText: { color: Colors.primary, fontWeight: '700' },
    disabled: { opacity: 0.6 },

    emptyContainer: { alignItems: 'center', marginTop: 32 },
    emptyText: { color: Colors.gray[500] },
});
