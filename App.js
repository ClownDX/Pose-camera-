import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, NativeModules, ActivityIndicator, useWindowDimensions, StatusBar } from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedProps, runOnJS } from 'react-native-reanimated';
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from 'react-native-vision-camera';
import { launchImageLibrary } from 'react-native-image-picker';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { imageToLineArt } from './src/outline';
import { useLevel, useAvailableLenses } from './src/hooks';
import { PoseOverlay, PresetSidebar, Grid, HorizonLevel, SliderRow, Chip } from './src/components';

const ReanimatedCamera = Reanimated.createAnimatedComponent(Camera);
Reanimated.addWhitelistedNativeProps({ zoom: true });

const RATIOS = { '1:1': 1, '4:3': 3 / 4, '16:9': 9 / 16 }; // width / height (portrait)
const LENS = { ultra: 'ultra-wide-angle-camera', wide: 'wide-angle-camera', tele: 'telephoto-camera' };
const LENS_LABEL = { ultra: '0.5x', wide: '1x', tele: '3x' };
const SHUT_MIN = 1 / 8000, SHUT_MAX = 1 / 2;
const PRESETS = Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, label: `Pose ${i + 1}`, source: null })); // set source: require('./assets/poses/x.png')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const { width } = useWindowDimensions();
  const camera = useRef(null);

  const [lens, setLens] = useState('wide');
  const [ratio, setRatio] = useState('4:3');
  const [timer, setTimer] = useState(0);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [grid, setGrid] = useState(true);
  const [level, setLevel] = useState(true);
  const [raw, setRaw] = useState(false);
  const [pro, setPro] = useState(false);
  const [isoT, setIsoT] = useState(0.5), [shT, setShT] = useState(0.5), [focusT, setFocusT] = useState(0.5);
  const [overlay, setOverlay] = useState(null);       // { source, aspect }
  const [opacity, setOpacity] = useState(0.5);
  const [editing, setEditing] = useState(true);
  const [presetId, setPresetId] = useState(null);
  const [processing, setProcessing] = useState(false);

  const lenses = useAvailableLenses();
  const roll = useLevel(level);
  const device = useCameraDevice('back', { physicalDevices: [LENS[lens]] });
  const format = useCameraFormat(device, [
    { photoAspectRatio: ratio === '16:9' ? 16 / 9 : 4 / 3 }, { photoResolution: 'max' },
  ]);

  useEffect(() => { if (!hasPermission) requestPermission(); }, [hasPermission]);

  // ---- zoom (pinch) + tap-to-focus ----
  const zoom = useSharedValue(1), startZoom = useSharedValue(1);
  useEffect(() => { zoom.value = device?.neutralZoom ?? 1; }, [device]);
  const minZ = device?.minZoom ?? 1, maxZ = Math.min(device?.maxZoom ?? 1, 16);
  const animatedProps = useAnimatedProps(() => ({ zoom: zoom.value }), [zoom]);
  const focusAt = useCallback((x, y) => camera.current?.focus({ x, y }).catch(() => {}), []);
  const camGesture = useMemo(() => Gesture.Simultaneous(
    Gesture.Pinch().enabled(!(overlay && editing))
      .onBegin(() => { startZoom.value = zoom.value; })
      .onUpdate((e) => { zoom.value = Math.min(maxZ, Math.max(minZ, startZoom.value * e.scale)); }),
    Gesture.Tap().onEnd((e) => runOnJS(focusAt)(e.x, e.y)),
  ), [minZ, maxZ, overlay, editing]);

  // ---- manual exposure: ISO + shutter folded into an EV bias (VisionCamera v4 has no true manual exposure) ----
  const minISO = format?.minISO ?? 50, maxISO = format?.maxISO ?? 1600;
  const iso = Math.round(minISO * Math.pow(maxISO / minISO, isoT));
  const shutter = SHUT_MIN * Math.pow(SHUT_MAX / SHUT_MIN, shT);
  const exposure = pro && device
    ? clamp((isoT - 0.5) * Math.log2(maxISO / minISO) + (shT - 0.5) * Math.log2(SHUT_MAX / SHUT_MIN), device.minExposure, device.maxExposure)
    : 0;

  // ---- manual focus + RAW need small native bridges (see README) ----
  const ManualFocus = NativeModules.ManualFocus, RawCapture = NativeModules.RawCapture;
  const onFocusSlider = (v) => { setFocusT(v); ManualFocus?.setLensPosition(v); };

  // ---- gallery -> line art ----
  const pickImage = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', includeBase64: true, maxWidth: 1280, maxHeight: 1280 });
    const asset = res.assets?.[0];
    if (!asset?.base64) return;
    try {
      setProcessing(true);
      const { uri, aspect } = await imageToLineArt(asset.base64);
      setOverlay({ source: { uri }, aspect }); setPresetId(null); setEditing(true);
    } catch (e) { Alert.alert('Could not process image', String(e.message || e)); }
    finally { setProcessing(false); }
  };

  const selectPreset = (p) => {
    if (!p.source) return Alert.alert('Placeholder', 'Add a white-line PNG to PRESETS[i].source.');
    setPresetId(p.id); setOverlay({ source: p.source, aspect: 0.6 });
  };

  // ---- capture with timer ----
  const capture = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    try {
      for (let i = timer; i > 0; i--) { setCount(i); await sleep(1000); }
      setCount(0);
      let path;
      if (raw && RawCapture) path = await RawCapture.capture();
      else path = (await camera.current.takePhoto({ flash: 'off', enableShutterSound: true })).path;
      await CameraRoll.saveAsset(path.startsWith('file://') ? path : 'file://' + path, { type: 'photo' });
    } catch (e) { Alert.alert('Capture failed', String(e.message || e)); }
    finally { setBusy(false); setCount(0); }
  };

  if (!hasPermission || !device) {
    return <View style={styles.center}><Text style={{ color: '#fff' }}>{hasPermission ? 'Loading camera…' : 'Camera permission required'}</Text></View>;
  }

  const boxH = width / RATIOS[ratio];

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <GestureDetector gesture={camGesture}>
        <View style={styles.fill}>
          <ReanimatedCamera ref={camera} style={StyleSheet.absoluteFill} device={device} format={format}
            isActive photo resizeMode="cover" exposure={exposure} animatedProps={animatedProps} />
        </View>
      </GestureDetector>

      {/* Preview frame: dims everything outside the chosen aspect ratio */}
      <View pointerEvents="none" style={[styles.frame, { height: boxH, maxHeight: '100%' }]} />
      <View style={[styles.preview, { height: Math.min(boxH, 9999) }]} pointerEvents="box-none">
        {grid && <Grid />}
        {overlay && <PoseOverlay source={overlay.source} aspect={overlay.aspect} opacity={opacity} editing={editing} />}
        {level && <HorizonLevel roll={roll} />}
      </View>

      {count > 0 && <View style={styles.countWrap} pointerEvents="none"><Text style={styles.count}>{count}</Text></View>}
      {processing && <View style={styles.countWrap}><ActivityIndicator size="large" color="#ffd60a" /></View>}

      <PresetSidebar presets={PRESETS} selectedId={presetId} onSelect={selectPreset} />

      {/* Top bar */}
      <View style={styles.top}>
        {Object.keys(RATIOS).map((r) => <Chip key={r} label={r} active={ratio === r} onPress={() => setRatio(r)} />)}
        <Chip label={`⏱ ${timer ? timer + 's' : 'Off'}`} onPress={() => setTimer((t) => ({ 0: 3, 3: 5, 5: 10, 10: 0 }[t]))} />
        <Chip label="▦" active={grid} onPress={() => setGrid((g) => !g)} />
        <Chip label="⎯ Lvl" active={level} onPress={() => setLevel((l) => !l)} />
      </View>

      {/* Bottom panel */}
      <View style={styles.bottom}>
        {pro && (
          <View style={styles.pro}>
            <SliderRow label="ISO" value={isoT} onChange={setIsoT} right={String(iso)} />
            <SliderRow label="Shutter" value={shT} onChange={setShT} right={`1/${Math.round(1 / shutter)}`} />
            <SliderRow label="Focus" value={focusT} onChange={onFocusSlider} disabled={!ManualFocus} right={ManualFocus ? focusT.toFixed(2) : 'n/a'} />
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <Chip label={raw ? 'RAW ✓' : 'RAW'} active={raw} disabled={!RawCapture} onPress={() => setRaw((r) => !r)} />
            </View>
          </View>
        )}
        {overlay && (
          <View style={styles.pro}>
            <SliderRow label="Opacity" value={opacity} onChange={setOpacity} right={`${Math.round(opacity * 100)}%`} />
          </View>
        )}
        <View style={styles.lensRow}>
          {Object.keys(LENS).filter((l) => lenses[l]).map((l) => (
            <Chip key={l} label={LENS_LABEL[l]} active={lens === l} onPress={() => setLens(l)} />
          ))}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={pickImage}><Text style={styles.act}>🖼 Pose</Text></TouchableOpacity>
          <TouchableOpacity onPress={capture} disabled={busy} style={[styles.shutter, busy && { opacity: 0.5 }]} />
          <View>
            <TouchableOpacity onPress={() => setPro((p) => !p)}><Text style={styles.act}>⚙ Pro</Text></TouchableOpacity>
            {overlay && <TouchableOpacity onPress={() => setEditing((e) => !e)}><Text style={styles.act}>{editing ? '🔓 Move' : '🔒 Lock'}</Text></TouchableOpacity>}
          </View>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fill: StyleSheet.absoluteFillObject,
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute', left: 0, right: 0, top: 0 },
  preview: { position: 'absolute', left: 0, right: 0, top: 0 },
  top: { position: 'absolute', top: 50, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 28, paddingHorizontal: 14, backgroundColor: 'rgba(0,0,0,0.45)' },
  pro: { paddingVertical: 4 },
  lensRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 6 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  act: { color: '#fff', fontSize: 14, paddingVertical: 4 },
  shutter: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#fff', borderWidth: 4, borderColor: '#999' },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { color: '#fff', fontSize: 120, fontWeight: '200' },
});
