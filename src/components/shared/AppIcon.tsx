import React from "react";
import type { StyleProp, TextStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  APP_ICONS,
  type AppIconKey,
  type MaterialCommunityIconName,
} from "../../constants/icons";

export type IconSizeToken = "xs" | "sm" | "md" | "lg" | "xl";

export const ICON_SIZES: Record<IconSizeToken, number> = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 26,
  xl: 32,
};

export interface AppIconProps {
  /**
   * Semantic key from APP_ICONS or direct MaterialCommunityIcons glyph name.
   */
  name: AppIconKey | MaterialCommunityIconName;
  /**
   * Predefined size token ('xs'=14, 'sm'=18, 'md'=22, 'lg'=26, 'xl'=32) or numeric dp.
   * Defaults to 'md' (22dp).
   */
  size?: IconSizeToken | number;
  /**
   * Glyph color token. Defaults to Deep Navy (#10244B).
   */
  color?: string;
  /**
   * When true (default), hides the icon from assistive accessibility services
   * because it is rendered adjacent to an informative text label.
   */
  decorative?: boolean;
  /**
   * Accessibility label for stand-alone/interactive icons.
   */
  accessibilityLabel?: string;
  /**
   * Optional test ID for Jest assertions.
   */
  testID?: string;
  /**
   * Optional style prop.
   */
  style?: StyleProp<TextStyle>;
}

/**
 * Standardized GCS vector icon component.
 * Ensures consistent theme tokens, sizing scales, and outdoor sunlight visibility.
 */
export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = "md",
  color = "#10244B",
  decorative = true,
  accessibilityLabel,
  testID,
  style,
}) => {
  const glyphName = (
    name in APP_ICONS ? APP_ICONS[name as AppIconKey] : name
  ) as MaterialCommunityIconName;

  const pixelSize = typeof size === "number" ? size : ICON_SIZES[size];

  return (
    <MaterialCommunityIcons
      name={glyphName}
      size={pixelSize}
      color={color}
      style={style}
      testID={testID ?? `app-icon-${glyphName}`}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no" : "auto"}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
    />
  );
};
