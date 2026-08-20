import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import GroupListScreen from '../screens/GroupListScreen';
import AddGCScreen from '../screens/AddGCScreen';
import ExploreScreen from '../screens/ExploreScreen';
import ProfileScreen from '../screens/ProfileScreen';
import Dock from './Dock';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        // The dock floats *over* the screen rather than taking a slot in the
        // layout. Left in flow it reserved its own height at the bottom, the
        // screen stopped above it, and the page background showed through that
        // strip as a solid block in a different shade than the screen — most
        // obvious in the installed PWA, where it lands on the home-indicator
        // area. Every screen already pads its content by DOCK_HEIGHT, so this
        // is the arrangement they were written for.
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
      tabBar={(props) => <Dock {...props} />}
    >
      <Tab.Screen name="GroupList" component={GroupListScreen} />
      <Tab.Screen name="AddGC" component={AddGCScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
