import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
    const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
    const [filteredContacts, setFilteredContacts] = useState<Contacts.Contact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [permissionStatus, setPermissionStatus] = useState<Contacts.PermissionStatus | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const { status } = await Contacts.requestPermissionsAsync();
                setPermissionStatus(status);

                if (status === 'granted') {
                    const { data } = await Contacts.getContactsAsync({
                        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
                        sort: Contacts.SortTypes.FirstName,
                    });

                    // Filter contacts that have phone numbers
                    const validContacts = data.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0);
                    setContacts(validContacts);
                    setFilteredContacts(validContacts);
                }
            } catch (error) {
                console.warn('Error fetching contacts', error);
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    const handleSearch = (text: string) => {
        setSearchQuery(text);
        if (!text.trim()) {
            setFilteredContacts(contacts);
            return;
        }
        const lower = text.toLowerCase();
        const filtered = contacts.filter(contact =>
            contact.name.toLowerCase().includes(lower) ||
            contact.phoneNumbers?.some(pn => pn.number?.includes(lower))
        );
        setFilteredContacts(filtered);
    };

    const handleInvite = async (contact: Contacts.Contact) => {
        if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) return;

        // Pick the first mobile number or just the first number
        const phoneNumber = contact.phoneNumbers[0].number;
        const cleanNumber = phoneNumber?.replace(/\D/g, ''); // keep only digits? WhatsApp usually handles + but let's be safe or just pass as is. 
        // Actually whatsapp uses international format without + or 00. 
        // But for "send" intent, usually mostly clean digits works. 

        // Invitation text
        const message = "Salut ! Je t'invite à me rejoindre sur Zwanga pour faciliter tes déplacements. Télécharge l'app ici : https://zwanga.com/app";

        const url = `whatsapp://send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;

        try {
            const supported = await Linking.canOpenURL(url);
            if (supported) {
                await Linking.openURL(url);
            } else {
                // Fallback to SMS if WhatsApp is not installed?
                const smsUrl = `sms:${phoneNumber}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;
                await Linking.openURL(smsUrl);
            }
        } catch (err) {
            console.error('An error occurred', err);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    if (permissionStatus !== 'granted') {
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

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={Colors.gray[500]} style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Rechercher un contact..."
                    value={searchQuery}
                    onChangeText={handleSearch}
                    placeholderTextColor={Colors.gray[400]}
                />
            </View>

            <FlatList
                data={filteredContacts}
                keyExtractor={(item) => (item as any).id || (item as any).lookupKey || Math.random().toString()}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.contactItem} onPress={() => handleInvite(item)}>
                        <View style={styles.avatar}>
                            {item.imageAvailable && item.image ? (
                                // <Image source={{ uri: item.image.uri }} ... />
                                // expo-contacts image uri might need handling, keeping it simple text for now
                                <Text style={styles.avatarText}>{item.name?.charAt(0)}</Text>
                            ) : (
                                <Text style={styles.avatarText}>{item.name?.charAt(0) || '?'}</Text>
                            )}
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
                        <Text style={styles.emptyText}>Aucun contact trouvé</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.white },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
    backButton: { padding: 4, borderRadius: 20 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray[900] },

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

    emptyContainer: { alignItems: 'center', marginTop: 32 },
    emptyText: { color: Colors.gray[500] },
});
