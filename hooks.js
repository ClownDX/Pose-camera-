import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import { useCameraDevices } from 'react-native-vision-camera';

const SIGN = Platform.OS === 'ios' ? -1 : 1; // flip if the horizon tilts the wrong way

// Roll angle in degrees (0 = level) from gravity, low-pass filtered.
export function useLevel(enabled) {
  const [roll, setRoll] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setUpdateIntervalForType(SensorTypes.accelerometer, 80);
    let r = 0;
    const sub = accelerometer.subscribe(({ x, y }) => {
      const deg = (Math.atan2(SIGN * x, SIGN * y) * 180) / Math.PI;
      const next = r * 0.8 + (Platform.OS === 'ios' ? -deg : deg) * 0.2;
      if (Math.abs(next - r) > 0.3) { r = next; setRoll(next); }
    });
    return () => sub.unsubscribe();
  }, [enabled]);
  return roll;
}

// Which back lenses physically exist on this device.
export function useAvailableLenses() {
  const devices = useCameraDevices();
  const has = (t) => devices.some((d) => d.position === 'back' && d.physicalDevices.length === 1 && d.physicalDevices[0] === t);
  return { ultra: has('ultra-wide-angle-camera'), wide: has('wide-angle-camera'), tele: has('telephoto-camera') };
}
