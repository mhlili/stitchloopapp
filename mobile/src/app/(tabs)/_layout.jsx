import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const icon = (name) => ({ color, size }) => <Ionicons name={name} color={color} size={size} />;

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#3b2335', tabBarShowLabel: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="wardrobe" options={{ title: 'Wardrobe', tabBarIcon: icon('shirt') }} />
      <Tabs.Screen name="market" options={{ title: 'Community', tabBarIcon: icon('people') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
