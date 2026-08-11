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
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => <Dock {...props} />}
    >
      <Tab.Screen name="GroupList" component={GroupListScreen} />
      <Tab.Screen name="AddGC" component={AddGCScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
