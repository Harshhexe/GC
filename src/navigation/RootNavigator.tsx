import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { colors } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import MainTabs from './MainTabs';
import WebShell from '../screens/web/WebShell';
import { useIsDesktopWeb } from '../hooks/useResponsiveLayout';
import ChatScreen from '../screens/ChatScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import PinnedMessagesScreen from '../screens/PinnedMessagesScreen';
import GroupSearchScreen from '../screens/GroupSearchScreen';
import MediaLinksFilesScreen from '../screens/MediaLinksFilesScreen';
import WhatDidIMissScreen from '../screens/WhatDidIMissScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import GCDNAScreen from '../screens/GCDNAScreen';
import WordyScreen from '../screens/WordyScreen';
import { InAppNotificationBanner } from '../components/InAppNotificationBanner';
import { AppUpdateModal } from '../components/AppUpdateModal';
import { useAppUpdates } from '../hooks/useAppUpdates';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Lets the push tap handler navigate from outside the React tree — the tap
 *  is delivered by a native listener, not by anything rendering. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surfaceLow,
    border: colors.outlineVariant,
    primary: colors.primary,
    text: colors.onSurface,
  },
};

export default function RootNavigator() {
  const { session, loading, justSignedUp } = useAuth();
  // Desktop browser gets the two-pane shell; a phone browser is still a
  // phone and keeps the identical mobile UI. Live-reactive, so resizing the
  // window switches layouts rather than stranding you in one.
  const isDesktopWeb = useIsDesktopWeb();

  // A cold-start tap resolves before the container mounts, so the target is
  // parked here and replayed from onReady — navigating before that is a
  // silent no-op, which reads as "the notification just opened the app".
  const pendingTap = useRef<{ groupId: string; messageId?: string } | null>(null);

  const goToChat = useCallback((target: { groupId: string; messageId?: string }) => {
    if (!navigationRef.isReady()) {
      pendingTap.current = target;
      return;
    }
    navigationRef.navigate('Chat', {
      groupId: target.groupId,
      jumpToMessageId: target.messageId,
    });
  }, []);

  usePushNotifications(session?.user.id, goToChat);

  const flushPendingTap = useCallback(() => {
    const target = pendingTap.current;
    if (!target) return;
    pendingTap.current = null;
    goToChat(target);
  }, [goToChat]);

  // Explicitly push Welcome screen if a new user just completed sign up
  useEffect(() => {
    if (session && justSignedUp && navigationRef.isReady()) {
      navigationRef.navigate('Welcome');
    }
  }, [session, justSignedUp]);

  const {
    isAvailable: isUpdateAvailable,
    isDownloading: isUpdateDownloading,
    error: updateError,
    updateMessage,
    isWhatsNewVisible,
    applyUpdate,
    dismissUpdate,
    dismissWhatsNew,
  } = useAppUpdates();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={flushPendingTap}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Navigator
          initialRouteName={session ? (justSignedUp ? 'Welcome' : 'MainTabs') : 'Auth'}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 220,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          {session ? (
            <>
              {justSignedUp ? (
                <>
                  <Stack.Screen
                    name="Welcome"
                    component={WelcomeScreen}
                    options={{ animation: 'fade', animationDuration: 500 }}
                  />
                  <Stack.Screen
                    name="MainTabs"
                    component={isDesktopWeb ? WebShell : MainTabs}
                    options={{ animation: 'fade' }}
                  />
                </>
              ) : (
                <>
                  <Stack.Screen
                    name="MainTabs"
                    component={isDesktopWeb ? WebShell : MainTabs}
                    options={{ animation: 'fade' }}
                  />
                  <Stack.Screen
                    name="Welcome"
                    component={WelcomeScreen}
                    options={{ animation: 'slide_from_bottom' }}
                  />
                </>
              )}
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
              <Stack.Screen name="PinnedMessages" component={PinnedMessagesScreen} />
              <Stack.Screen
                name="GroupSearch"
                component={GroupSearchScreen}
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="MediaLinksFiles" component={MediaLinksFilesScreen} />
              <Stack.Screen
                name="Wordy"
                component={WordyScreen}
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="GCDNA"
                component={GCDNAScreen}
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="WhatDidIMiss"
                component={WhatDidIMissScreen}
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{ animation: 'slide_from_bottom' }}
              />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthScreen} options={{ animation: 'fade' }} />
          )}
        </Stack.Navigator>
        {session && <InAppNotificationBanner onTap={goToChat} />}
        <AppUpdateModal
          visible={isUpdateAvailable}
          type="available"
          isDownloading={isUpdateDownloading}
          error={updateError}
          updateMessage={updateMessage}
          onUpdate={applyUpdate}
          onDismiss={dismissUpdate}
        />
        <AppUpdateModal
          visible={isWhatsNewVisible}
          type="whats_new"
          onDismiss={dismissWhatsNew}
        />
      </View>
    </NavigationContainer>
  );
}
