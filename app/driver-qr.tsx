import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { isDriverAccount } from '@/utils/accountRole';
import { DriverQrContent } from '@/features/driver-qr/DriverQrContent';
import { styles } from '@/features/driver-qr/DriverQr.styles';
import { Colors } from '@/constants/styles';

export default function DriverQrScreen() {
  const user = useAppSelector(selectUser);
  const router = useRouter();
  return <SafeAreaView style={styles.page}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} accessibilityRole="button" accessibilityLabel="Retour au profil"
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')}>
        <Ionicons name="chevron-back" size={26} color={Colors.gray[900]} />
      </TouchableOpacity>
      <Text style={styles.title}>Mon QR conducteur</Text>
    </View>
    {user && isDriverAccount(user) ? <DriverQrContent key={user.id} driverId={user.id} /> :
      <Text style={styles.hint}>Cette fiche est réservée aux conducteurs.</Text>}
  </SafeAreaView>;
}
