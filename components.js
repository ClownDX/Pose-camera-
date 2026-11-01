import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

// Draggable + pinch-scalable outline. Gestures only active while `editing`.
export function PoseOverlay({ source, aspect = 0.6, opacity, editing }) {
  const tx = useSharedValue(0), ty = useSharedValue(0), s = useSharedValue(1);
  const pan = Gesture.Pan().enabled(editing).onChange((e) => { tx.value += e.changeX; ty.value += e.changeY; });
  const pinch = Gesture.Pinch().enabled(editing).onChange((e) => { s.value = Math.min(6, Math.max(0.2, s.value * e.scaleChange)); });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={editing ? 'auto' : 'none'}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
        <Animated.Image source={source} resizeMode="contain"
          style={[{ position: 'absolute', alignSelf: 'center', top: '10%', height: '80%', aspectRatio: aspect, opacity }, style]} />
      </GestureDetector>
    </View>
  );
}

export function PresetSidebar({ presets, selectedId, onSelect }) {
  return (
    <View style={styles.sidebar}>
      <FlatList data={presets} keyExtractor={(p) => p.id} showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => onSelect(item)}
            style={[styles.thumb, selectedId === item.id && { borderColor: '#ffd60a' }]}>
            <Text style={styles.thumbTxt}>{item.label}</Text>
          </TouchableOpacity>
        )} />
    </View>
  );
}

export const Grid = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {[1, 2].map((i) => <View key={'v' + i} style={[styles.line, { left: `${(i * 100) / 3}%`, top: 0, bottom: 0, width: 1 }]} />)}
    {[1, 2].map((i) => <View key={'h' + i} style={[styles.line, { top: `${(i * 100) / 3}%`, left: 0, right: 0, height: 1 }]} />)}
  </View>
);

export const HorizonLevel = ({ roll }) => (
  <View style={styles.levelWrap} pointerEvents="none">
    <View style={[styles.levelLine, { backgroundColor: Math.abs(roll) < 1 ? '#30d158' : '#fff', transform: [{ rotate: `${-roll}deg` }] }]} />
    <Text style={styles.levelTxt}>{roll.toFixed(1)}°</Text>
  </View>
);

export const SliderRow = ({ label, value, onChange, disabled, right }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Slider style={{ flex: 1 }} value={value} onValueChange={onChange} disabled={disabled}
      minimumTrackTintColor="#ffd60a" maximumTrackTintColor="#555" thumbTintColor="#fff" />
    <Text style={styles.rowVal}>{right}</Text>
  </View>
);

export const Chip = ({ label, active, onPress, disabled }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled}
    style={[styles.chip, active && { backgroundColor: '#ffd60a' }, disabled && { opacity: 0.35 }]}>
    <Text style={[styles.chipTxt, active && { color: '#000' }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  sidebar: { position: 'absolute', left: 6, top: 90, bottom: 230, width: 64 },
  thumb: { width: 60, height: 80, marginBottom: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  thumbTxt: { color: '#fff', fontSize: 10, textAlign: 'center' },
  line: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.4)' },
  levelWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  levelLine: { width: '60%', height: 2 },
  levelTxt: { color: '#fff', fontSize: 11, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', height: 34 },
  rowLabel: { color: '#fff', width: 64, fontSize: 12 },
  rowVal: { color: '#ffd60a', width: 58, fontSize: 12, textAlign: 'right' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', marginRight: 6 },
  chipTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
