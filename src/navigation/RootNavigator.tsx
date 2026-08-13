import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import MainTabs from './MainTabs';
import ChatScreen from '../screens/ChatScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import PinnedMessagesScreen from '../screens/PinnedMessagesScreen';
import GroupSearchScreen from '../screens/GroupSearchScreen';
import MediaLinksFilesScreen from '../screens/MediaLinksFilesScreen';
import WhatDidIMissScreen from '../screens/WhatDidIMissScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={session && justSignedUp ? 'Welcome' : 'MainTabs'}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 320,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {session ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: 'fade' }} />
            <Stack.Screen
              name="Welcome"
              component={WelcomeScreen}
              options={{ animation: 'fade', animationDuration: 500 }}
            />
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
    </NavigationContainer>
  );
}
