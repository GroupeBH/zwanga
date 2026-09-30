import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authCodeStyles as styles } from '@/features/auth/authCode.styles';

export function AuthCodeHeading({ title, subtitle, icon, keyboardVisible = false }: {
  title: string; subtitle: string; icon: 'key-outline' | 'lock-closed-outline'; keyboardVisible?: boolean;
}) {
  return <View style={styles.heading}>
    {!keyboardVisible && <View style={styles.headingIcon} accessible={false}>
      <Ionicons name={icon} size={28} color={Colors.primary} />
    </View>}
    <View style={[styles.headingCopy, keyboardVisible && styles.keyboardHeadingCopy]}>
      <Text style={[styles.title, keyboardVisible && styles.keyboardTitle]} accessibilityRole="header">{title}</Text>
      <Text style={[styles.subtitle, keyboardVisible && styles.keyboardSubtitle]}>{subtitle}</Text>
    </View>
  </View>;
}
