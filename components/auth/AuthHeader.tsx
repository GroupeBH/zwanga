import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from './styles';
import { AuthMode } from './types';

interface AuthHeaderProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  canGoBack: boolean;
  onBack: () => void;
  progress: number;
  motivationalMessage: string;
}

export function AuthHeader({
  mode,
  onModeChange,
  canGoBack,
  onBack,
  progress,
  motivationalMessage,
}: AuthHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        {canGoBack ? (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[800]} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, mode === 'login' && styles.toggleButtonActive]}
            onPress={() => onModeChange('login')}
          >
            <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>
              Connexion
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, mode === 'signup' && styles.toggleButtonActive]}
            onPress={() => onModeChange('signup')}
          >
            <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextActive]}>
              Inscription
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
      </View>

      {motivationalMessage ? (
        <Text style={styles.motivationalText}>{motivationalMessage}</Text>
      ) : null}
    </View>
  );
}

