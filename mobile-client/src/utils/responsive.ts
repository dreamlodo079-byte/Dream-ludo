import { Dimensions, PixelRatio, useWindowDimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Standard design baseline (iPhone 13 / 14: 390 x 844)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

/**
 * Converts width percentage to DP
 */
export const wp = (widthPercent: number | string): number => {
  const elemWidth = typeof widthPercent === 'number' ? widthPercent : parseFloat(widthPercent);
  return PixelRatio.roundToNearestPixel((SCREEN_WIDTH * elemWidth) / 100);
};

/**
 * Converts height percentage to DP
 */
export const hp = (heightPercent: number | string): number => {
  const elemHeight = typeof heightPercent === 'number' ? heightPercent : parseFloat(heightPercent);
  return PixelRatio.roundToNearestPixel((SCREEN_HEIGHT * elemHeight) / 100);
};

/**
 * Responsive Font Scaling
 * Scales font sizes smoothly between small phones, large phones, and tablets.
 */
export const rf = (size: number): number => {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * scale;
  
  // Cap font scaling for tablets and small screens so fonts stay balanced
  if (SCREEN_WIDTH >= 768) {
    return Math.round(PixelRatio.roundToNearestPixel(size * 1.15));
  }
  if (SCREEN_WIDTH <= 360) {
    return Math.round(PixelRatio.roundToNearestPixel(size * 0.92));
  }
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

/**
 * Checks if current device is a tablet or desktop screen
 */
export const isTablet = SCREEN_WIDTH >= 768;

/**
 * Returns optimal max width for card containers on large devices
 */
export const maxContainerWidth = isTablet ? 640 : '100%';

/**
 * Dynamic Hook for Screen Dimensions & Responsiveness
 */
export const useResponsive = () => {
  const { width, height } = useWindowDimensions();
  const isTab = width >= 768;
  const isSmallPhone = width <= 360;

  const scaleFont = (size: number) => {
    if (isTab) return Math.round(size * 1.15);
    if (isSmallPhone) return Math.round(size * 0.92);
    return Math.round((width / BASE_WIDTH) * size);
  };

  return {
    width,
    height,
    isTablet: isTab,
    isSmallPhone,
    wp: (pct: number) => PixelRatio.roundToNearestPixel((width * pct) / 100),
    hp: (pct: number) => PixelRatio.roundToNearestPixel((height * pct) / 100),
    rf: scaleFont,
    containerMaxWidth: isTab ? 640 : '100%',
    cardPadding: isTab ? 24 : isSmallPhone ? 12 : 16,
  };
};
