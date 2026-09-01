import './global.css';
import { Component, ReactNode, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SystemBars } from 'react-native-edge-to-edge';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { colors, typography } from './src/theme/theme';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Runtime Error:', error, errorInfo);
  }

  /*
   * A real process restart, not a state reset.
   *
   * Clearing hasError re-mounts the same tree with the same state that just
   * threw, so for anything other than a transient render error it crashes
   * straight back to this screen. reloadAsync restarts the app from scratch,
   * which is what actually recovers. It is unavailable in Expo Go and dev
   * builds, so the soft reset stays as the fallback rather than the default.
   */
  handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      this.setState({ hasError: false, error: null });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorRoot}>
          {/* Key light, so the screen belongs to GC rather than reading as a
              system crash dialog. */}
          <LinearGradient
            colors={['rgba(129, 140, 248, 0.16)', 'rgba(129, 140, 248, 0)']}
            style={styles.errorGlow}
            pointerEvents="none"
          />

          <View style={styles.errorCard}>
            <View style={styles.errorIconRing}>
              <Ionicons name="refresh-outline" size={26} color={colors.primary} />
            </View>

            <Text style={styles.errorTitle}>GC needs a restart</Text>
            <Text style={styles.errorBody}>
              Something in the app stopped responding. Restarting almost always
              clears it, and nothing you sent has been lost.
            </Text>

            {/*
              The raw message is kept, but demoted. As the headline it told
              people nothing they could act on; down here in monospace it is
              still exact enough to screenshot into a bug report.
            */}
            {!!this.state.error?.message && (
              <View style={styles.errorDetail}>
                <Text style={styles.errorDetailLabel}>DETAILS</Text>
                <Text style={styles.errorDetailText} numberOfLines={4}>
                  {this.state.error.message}
                </Text>
              </View>
            )}

            <Pressable style={styles.primaryBtn} onPress={this.handleRestart}>
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.primaryBtnText}>Restart GC</Text>
            </Pressable>

            <Pressable
              style={styles.secondaryBtn}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={styles.secondaryBtnText}>Try without restarting</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Ionicons.font,
    StickerFont: require('./src/assets/fonts/Anton-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
    const fallbackTimer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 1200);
    return () => clearTimeout(fallbackTimer);
  }, [fontsLoaded, fontError]);

  return (
    <GestureHandlerRootView style={{ flex: 1, width: '100%', height: '100%', backgroundColor: colors.appChrome }}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.appChrome }}>
        <StatusBar style="light" backgroundColor={colors.appRoot} />
        {/* SDK 54 forces edge-to-edge on Android — the status/nav bars are
            always transparent and `androidNavigationBar` in app.json is
            dead config (no plugin reads it). This is the actual control
            surface: it only sets icon contrast, since the bars themselves
            are transparent and the app's own dark background (set via
            expo-system-ui's activityBackground) shows straight through
            instead of the OS default white. */}
        <SystemBars style="light" />
        <ErrorBoundary>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    backgroundColor: colors.appRoot,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  errorCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 26,
    alignItems: 'center',
  },
  errorIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.34)',
    marginBottom: 16,
  },
  errorTitle: {
    ...typography.title,
    color: colors.onSurface,
    textAlign: 'center',
  },
  errorBody: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 8,
  },
  errorDetail: {
    width: '100%',
    backgroundColor: colors.appChrome,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 20,
  },
  errorDetailLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: 6,
  },
  errorDetailText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  primaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 22,
  },
  primaryBtnText: {
    ...typography.subheading,
    color: '#FFFFFF',
  },
  secondaryBtn: {
    paddingVertical: 12,
    marginTop: 4,
  },
  secondaryBtnText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
