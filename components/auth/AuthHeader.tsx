import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated from '@/utils/reanimated';
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
  const showSignupProgress = mode === 'signup' && progress > 0 && progress < 100;

  return (
    <View style={styles.header}>
      <View style={[styles.headerTop, canGoBack && styles.headerTopCentered]}>
        {canGoBack ? (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={28} color={Colors.primaryDark} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 0 }} />
        )}

        {canGoBack ? (
          <Text style={styles.headerBrand}>Zwanga</Text>
        ) : (
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
        )}

        {!canGoBack && <View style={{ width: 0 }} />}
      </View>

      {showSignupProgress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </View>
      )}

      {showSignupProgress && motivationalMessage ? (
        <Text style={styles.motivationalText}>{motivationalMessage}</Text>
      ) : null}
    </View>
  );
}

