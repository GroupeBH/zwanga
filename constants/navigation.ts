import { Spacing } from './styles';
import { Platform } from 'react-native';

const IOS_TAB_BAR_TOP_PADDING = 10;
const ANDROID_TAB_BAR_TOP_PADDING = 8;
const IOS_TAB_BAR_MIN_BOTTOM_PADDING = 16;
const ANDROID_TAB_BAR_MIN_BOTTOM_PADDING = 10;
const IOS_TAB_BAR_CONTENT_HEIGHT = 54;
const ANDROID_TAB_BAR_CONTENT_HEIGHT = 56;

export const getTabBarMetrics = (bottomInset = 0) => {
  const isIOS = Platform.OS === 'ios';
  const paddingTop = isIOS ? IOS_TAB_BAR_TOP_PADDING : ANDROID_TAB_BAR_TOP_PADDING;
  const paddingBottom = Math.max(
    bottomInset,
    isIOS ? IOS_TAB_BAR_MIN_BOTTOM_PADDING : ANDROID_TAB_BAR_MIN_BOTTOM_PADDING
  );
  const contentHeight = isIOS ? IOS_TAB_BAR_CONTENT_HEIGHT : ANDROID_TAB_BAR_CONTENT_HEIGHT;

  return {
    height: contentHeight + paddingTop + paddingBottom,
    paddingTop,
    paddingBottom,
  };
};

export const getFloatingBannerBottomOffset = (bottomInset = 0) =>
  getTabBarMetrics(bottomInset).height + Spacing.sm;
