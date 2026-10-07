import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type MapStyleMode = 'satellite' | 'streets' | 'dark';

// Icon shown on the toggle for each basemap mode
const MAP_STYLE_ICON: Record<MapStyleMode, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  satellite: 'image-filter-hdr',
  streets: 'road-variant',
  dark: 'earth',
};

interface Props {
  mapStyle: MapStyleMode;
  onToggleMapStyle: () => void;
  onFitMission: () => void;
  onCenterRover: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const MapBottomControlsBar: React.FC<Props> = ({
  mapStyle,
  onToggleMapStyle,
  onFitMission,
  onCenterRover,
  onZoomIn,
  onZoomOut,
  disabled = false,
  style,
}) => (
  <View style={[styles.dock, style]} pointerEvents="box-none">
    <View style={styles.focusGroup}>
      <TouchableOpacity style={[styles.focusButton, disabled && styles.disabled]} onPress={onFitMission} disabled={disabled} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="Focus mission plan">
        <MaterialCommunityIcons name="vector-polyline" size={18} color="#1475EE" />
        <Text style={styles.focusText}>Plan</Text>
      </TouchableOpacity>
      <View style={styles.focusDivider} />
      <TouchableOpacity style={[styles.focusButton, disabled && styles.disabled]} onPress={onCenterRover} disabled={disabled} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="Focus rover">
        <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#1475EE" />
        <Text style={styles.focusText}>Rover</Text>
      </TouchableOpacity>
    </View>
    <View style={styles.zoomGroup}>
      <TouchableOpacity style={[styles.zoomButton, disabled && styles.disabled]} onPress={onZoomIn} disabled={disabled} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="Zoom in">
        <MaterialCommunityIcons name="plus" size={24} color="#173563" />
      </TouchableOpacity>
      <View style={styles.zoomDivider} />
      <TouchableOpacity style={[styles.zoomButton, disabled && styles.disabled]} onPress={onZoomOut} disabled={disabled} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="Zoom out">
        <MaterialCommunityIcons name="minus" size={24} color="#173563" />
      </TouchableOpacity>
    </View>
    <TouchableOpacity style={[styles.layersButton, disabled && styles.disabled]} onPress={onToggleMapStyle} disabled={disabled} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="Change map style">
      <MaterialCommunityIcons name={MAP_STYLE_ICON[mapStyle]} size={20} color="#536D97" />
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    alignItems: 'flex-end',
    gap: 9,
    elevation: 8,
    shadowColor: '#10244B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    zIndex: 1000,
  },
  focusGroup: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: '#DCE7F5',
    borderRadius: 14,
    paddingHorizontal: 5,
  },
  focusButton: {
    height: 38,
    minWidth: 78,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
  },
  focusText: {
    color: '#173563',
    fontSize: 11,
    fontWeight: '800',
  },
  focusDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#DCE7F5',
  },
  zoomGroup: {
    width: 48,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: '#DCE7F5',
    borderRadius: 14,
    overflow: 'hidden',
  },
  zoomButton: {
    width: 46,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomDivider: {
    height: 1,
    marginHorizontal: 8,
    backgroundColor: '#DCE7F5',
  },
  layersButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: '#DCE7F5',
  },
  disabled: {
    opacity: 0.42,
  },
});
