import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  DevSettings,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  retryKey: number;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    retryKey: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  private retry = () => {
    this.setState((state) => ({
      error: null,
      retryKey: state.retryKey + 1,
    }));
  };

  private reload = () => {
    try {
      DevSettings.reload();
    } catch (error) {
      console.error('[AppErrorBoundary] Reload failed:', error);
      this.retry();
    }
  };

  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>!</Text>
          </View>
          <Text style={styles.title}>Un problème est survenu</Text>
          <Text style={styles.message}>
            L&apos;application a rencontré une erreur inattendue. Vos données enregistrées sont
            conservées.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.86}
            style={styles.primaryButton}
            onPress={this.retry}
          >
            <Text style={styles.primaryButtonText}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.82}
            style={styles.secondaryButton}
            onPress={this.reload}
          >
            <Text style={styles.secondaryButtonText}>Redémarrer l&apos;application</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.danger + '12',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    marginBottom: Spacing.lg,
  },
  iconText: {
    color: Colors.danger,
    fontSize: 30,
    fontWeight: FontWeights.bold,
  },
  title: {
    color: Colors.gray[900],
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  message: {
    maxWidth: 360,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    lineHeight: 22,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    maxWidth: 360,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  secondaryButton: {
    width: '100%',
    maxWidth: 360,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  secondaryButtonText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
