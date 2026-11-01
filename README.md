# Pose Camera (React Native, Android + iOS)

## Install
```bash
npm i react-native-vision-camera react-native-reanimated react-native-gesture-handler \
  react-native-image-picker @shopify/react-native-skia react-native-sensors \
  @react-native-community/slider @react-native-camera-roll/camera-roll
cd ios && pod install
```
Requires RN 0.73+. `babel.config.js`: add `'react-native-reanimated/plugin'` as the LAST plugin
(Reanimated 4: `'react-native-worklets/plugin'`). Frame processors are not needed, so `react-native-worklets-core` is optional.

## Android
`android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```
Set `minSdkVersion = 26` in `android/build.gradle`. The image picker uses the system Photo Picker, so no gallery permission is needed to pick.

## iOS (`Info.plist`)
```xml
<key>NSCameraUsageDescription</key><string>Used for the live pose camera.</string>
<key>NSPhotoLibraryUsageDescription</key><string>Pick a photo to turn into a pose outline.</string>
<key>NSPhotoLibraryAddUsageDescription</key><string>Save the photos you take.</string>
<key>NSMotionUsageDescription</key><string>Used for the horizon leveler.</string>
```

## Honest limits of VisionCamera v4
| Feature | What the code does |
|---|---|
| Shutter speed / ISO | v4 exposes only exposure bias (EV). ISO and shutter sliders are combined into an EV offset, clamped to `device.minExposure..maxExposure`. True manual exposure needs a native module. |
| Manual focus | v4 only has tap-to-focus. The slider calls `NativeModules.ManualFocus.setLensPosition(0..1)` if you add that bridge (AVCaptureDevice `setFocusModeLocked` / Camera2 `LENS_FOCUS_DISTANCE`); otherwise it is disabled. |
| RAW (DNG) | Not in v4. The toggle needs a `NativeModules.RawCapture.capture()` bridge; otherwise it is disabled. |
| 1:1 | No sensor format is 1:1. Preview is cropped; crop the saved JPEG to square (e.g. with an image-resizer library) if you need the file square. |
| Horizon sign | Accelerometer axes differ per platform. If the line tilts the wrong way, flip `SIGN` in `useLevel`. |
