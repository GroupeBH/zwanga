import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BookingPaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    bookingId?: string;
    status?: string;
  }>();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace({
        pathname: '/bookings',
        params: {
          bookingId: params.bookingId,
          paymentStatus: params.status ?? 'returned',
        },
      } as any);
    }, 450);

    return () => clearTimeout(timer);
  }, [params.bookingId, params.status, router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="card-outline" size={28} color={Colors.primary} />
        </View>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.title}>Retour du paiement</Text>
        <Text style={styles.text}>Vérification du paiement en cours...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.gray[50],
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
  },
  icon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '12',
  },
  title: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  text: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
});
