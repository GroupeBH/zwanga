import { getTabContentOverlay } from '@/features/navigation/accountTabPolicy';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import SearchScreen from '../search';

export default function ExploreScreen() {
  const height = useBottomTabBarHeight();
  return <SearchScreen embedded bottomOverlay={getTabContentOverlay(Platform.OS, height)} />;
}
