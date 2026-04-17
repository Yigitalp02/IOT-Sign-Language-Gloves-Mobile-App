import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import './src/i18n/i18n';
import { useTranslation } from 'react-i18next';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import ConnectionManager from './src/components/ConnectionManager';
import DigitalTwin, { DigitalTwinRef } from './src/components/DigitalTwin';

// ── Quaternion helpers (same math as the desktop app / HandVisualization3D) ──
type Quat = { w: number; x: number; y: number; z: number };
const qMult = (a: Quat, b: Quat): Quat => ({
  w: a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
  x: a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
  y: a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
  z: a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w,
});
const qInv = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });
const TWIN_EMA_ALPHA = 0.25; // EMA smoothing (0=frozen, 1=raw)
import CalibrationManager from './src/components/CalibrationManager';
import SimulatorControl from './src/components/SimulatorControl';
import { normalizeSample, isRawThermistorData, DEFAULT_BASELINES, DEFAULT_MAXBENDS } from './src/utils/normalization';
import PredictionView from './src/components/PredictionView';
import PredictionHistory from './src/components/PredictionHistory';
import DebugLog from './src/components/DebugLog';
import SensorDisplay from './src/components/SensorDisplay';
import QuickDemo from './src/components/QuickDemo';
import Dropdown from './src/components/Dropdown';
import apiService, { PredictionResponse } from './src/services/apiService';

interface PredictionRecord {
  letter: string;
  confidence: number;
  timestamp: number;
}

interface DebugLogData {
  simulationStartTime?: number;
  simulationEndTime?: number;
  firstSample?: number[];
  lastSample?: number[];
  totalSamples?: number;
  apiCallTime?: number;
  apiResponseTime?: number;
  apiResponse?: PredictionResponse;
  error?: string;
}

function AppContent() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, colors, isDark } = useTheme();
  
  // ── Rolling window constants (matches training / desktop app) ────────────
  const WINDOW_SIZE = 50; // 50 samples at 50Hz = 1s of data in the window

  // Prediction state
  const [sensorBuffer, setSensorBuffer] = useState<number[][]>([]); // QuickDemo batch mode only
  const isCollectingRef = React.useRef(true);
  const [lastSampleCount, setLastSampleCount] = useState(0);
  const [currentPrediction, setCurrentPrediction] = useState<PredictionResponse | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [predictionHistory, setPredictionHistory] = useState<PredictionRecord[]>([]);
  
  // Real-time sensor display — throttled to ~10 fps to prevent UI thrashing at 50 Hz
  const [currentSample, setCurrentSample] = useState<number[] | null>(null);
  // Raw ADC flex values (only set for real WiFi glove; null for simulator which already sends 0-1)
  const [rawFlexSample, setRawFlexSample] = useState<number[] | null>(null);
  const [currentImu, setCurrentImu] = useState<[number, number, number, number] | null>(null);
  const currentImuRef = React.useRef<[number, number, number, number] | null>(null);
  const currentMotionRef = React.useRef<{ lx: number; ly: number; lz: number; gx: number; gy: number; gz: number } | null>(null);
  const lastDisplayUpdateRef = React.useRef(0);
  // Raw data log — last 10 lines, throttled to ~5 fps
  const [rawDataLog, setRawDataLog] = useState<string[]>([]);
  const lastRawLogUpdateRef = React.useRef(0);

  // Digital Twin (WebGL WebView)
  const [twinVisible, setTwinVisible]   = useState(false);
  const digitalTwinRef                  = useRef<DigitalTwinRef>(null);
  const twinRefQuatRef                  = useRef<Quat | null>(null);
  const twinEmaRef                      = useRef<number[] | null>(null);
  const twinLastSentRef                 = useRef(0);
  // Lock spatial movement: omit motion/gyro payload so twin only shows
  // finger flex + wrist orientation without translating in 3D space.
  const [lockSpatial, setLockSpatial]   = useState(false);
  const lockSpatialRef                  = useRef(false);
  // Auto-range: tracks per-finger min/max seen in the session so the twin
  // can show movement even before the user runs formal calibration.
  // Convention: higher ADC value = finger straight (same as normalization.ts).
  const twinAutoRangeRef                = useRef<{ min: number[]; max: number[] } | null>(null);
  // Ref so handleSensorData (useCallback) always sees current twinVisible without stale closure
  const twinVisibleRef                  = useRef(false);
  React.useEffect(() => { twinVisibleRef.current = twinVisible; }, [twinVisible]);
  // CalibrationManager registers a handler here to receive every raw sample at full 50 Hz
  const calibSampleHandlerRef = React.useRef<((data: number[]) => void) | null>(null);
  const onRegisterCalibSampleHandler = useCallback(
    (fn: ((data: number[]) => void) | null) => { calibSampleHandlerRef.current = fn; },
    [],
  );
  
  // Debug state
  const [debugLogData, setDebugLogData] = useState<DebugLogData | null>(null);
  const [isDebugVisible, setIsDebugVisible] = useState(true);
  const simulationStartTimeRef = React.useRef<number>(0);
  
  // Simulator state
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Connection state
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  // Ref so closures (handleSensorData) always see the latest value without stale closure
  const connectedDeviceRef = React.useRef<string | null>(null);
  React.useEffect(() => { connectedDeviceRef.current = connectedDevice; }, [connectedDevice]);

  // Calibration state
  const [calibBaselines, setCalibBaselines] = useState<number[]>(DEFAULT_BASELINES);
  const [calibMaxbends,  setCalibMaxbends]  = useState<number[]>(DEFAULT_MAXBENDS);
  const [isCalibrated,   setIsCalibrated]   = useState(false);
  // Refs so the rolling-window callback always reads the latest calibration
  const calibBaselinesRef = React.useRef(DEFAULT_BASELINES);
  const calibMaxbendsRef  = React.useRef(DEFAULT_MAXBENDS);
  React.useEffect(() => { calibBaselinesRef.current = calibBaselines; }, [calibBaselines]);
  React.useEffect(() => { calibMaxbendsRef.current  = calibMaxbends;  }, [calibMaxbends]);

  // Word building state
  const [detectedLetters, setDetectedLetters] = useState<string[]>([]);
  const detectedLettersRef = React.useRef<string[]>([]); // Ref to always have current value
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [minConfidence, setMinConfidence] = useState(0.6); // Threshold for auto-accept

  // Keep ref in sync with state
  React.useEffect(() => {
    detectedLettersRef.current = detectedLetters;
  }, [detectedLetters]);

  // ── Rolling window refs (real glove / manual simulator) ──────────────────
  const rollingBufferRef = React.useRef<number[][]>([]);
  const isPredictingRef  = React.useRef(false); // prevents concurrent API calls
  // Stable prediction tracking for continuous word building
  const stablePredRef       = React.useRef<{ letter: string; count: number }>({ letter: '', count: 0 });
  const letterUsedRef       = React.useRef(false); // prevent re-adding same stable letter
  const lastHapticLetterRef = React.useRef<string>(''); // only vibrate when predicted letter changes

  // QuickDemo control - notify when prediction completes
  const quickDemoCallbackRef = React.useRef<(() => void) | null>(null);

  // Handler to programmatically trigger letter simulation
  const simulateLetter = useCallback((letter: string) => {
    if (!isContinuousMode) setIsContinuousMode(true);
    setIsSimulating(true);
    setCurrentSample(null);
    setSensorBuffer([]);
    // Reset rolling window so the new letter starts fresh
    rollingBufferRef.current = [];
    stablePredRef.current = { letter: '', count: 0 };
    letterUsedRef.current = false;
    isCollectingRef.current = true;
    simulationStartTimeRef.current = Date.now();
    simulateLetterRef.current = letter;
  }, [isContinuousMode]);

  const simulateLetterRef = React.useRef<string | null>(null);

  // Reset collecting flag when starting simulation
  React.useEffect(() => {
    if (isSimulating) {
      isCollectingRef.current = true;
      simulationStartTimeRef.current = Date.now();
    }
  }, [isSimulating]);

  // Track last sample time for idle detection in continuous mode
  const lastSampleTimeRef = React.useRef<number>(Date.now());
  const idleTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Auto-restart collection in continuous mode (ONLY if simulator is still running manually, NOT for QuickDemo)
  React.useEffect(() => {
    // Don't auto-restart if QuickDemo is in control!
    if (quickDemoCallbackRef.current) {
      console.log('[Continuous mode] QuickDemo is in control, skipping auto-restart');
      return;
    }
    
    // Don't auto-restart if we just finished a prediction - let the simulator keep running
    // This effect should only fire when we're in continuous mode and ready for the next cycle
    if (isContinuousMode && !isCollectingRef.current && !isAnalyzing && isSimulating) {
      // Wait a bit, then restart collection (only if simulator is still running)
      const timer = setTimeout(() => {
        // Double-check simulator is still running (user didn't stop it) AND QuickDemo isn't running
        if (isSimulating && !quickDemoCallbackRef.current) {
          console.log('[Continuous mode] Restarting collection for next letter');
          isCollectingRef.current = true;
          setSensorBuffer([]);
          simulationStartTimeRef.current = Date.now();
          lastSampleTimeRef.current = Date.now(); // Reset idle timer
        } else {
          console.log('[Continuous mode] Simulator stopped or QuickDemo active, not restarting');
        }
      }, 500); // 0.5s pause between predictions
      
      return () => clearTimeout(timer);
    }
  }, [isContinuousMode, isAnalyzing, isSimulating]);

  // Word finalization state
  const [isWordFinalized, setIsWordFinalized] = React.useState(false);

  // Idle detection: If no samples for 2 seconds in continuous mode, finalize the word
  React.useEffect(() => {
    // Works for BOTH simulator and real glove!
    const isActiveInContinuousMode = isContinuousMode && (isSimulating || connectedDevice !== null);
    
    if (isActiveInContinuousMode && detectedLetters.length > 0 && !isWordFinalized) {
      // Clear existing idle timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      // Set a new idle timer
      idleTimerRef.current = setTimeout(() => {
        const timeSinceLastSample = Date.now() - lastSampleTimeRef.current;
        // Only finalize if: not in QuickDemo, enough idle time, and word not already finalized
        if (timeSinceLastSample >= 2000 && !quickDemoCallbackRef.current && !isWordFinalized) {
          console.log('[Continuous mode] No samples for 2s - finalizing word and speaking');
          
          // Speak the complete word from prediction view
          const finalWord = detectedLetters.join('');
          if (finalWord.length > 0) {
            console.log(`[Continuous mode] Speaking final word from prediction view: "${finalWord}"`);
            Speech.speak(finalWord, {
              language: 'en-US',
              rate: 0.8,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            // Mark word as finalized
            setIsWordFinalized(true);
          }
        }
      }, 2500); // Check 2.5 seconds after last sample
    }

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [isContinuousMode, isSimulating, connectedDevice, detectedLetters, isWordFinalized]);

  const makePrediction = useCallback(async (samples: number[][]): Promise<void> => {
    const simulationEndTime = Date.now();
    const apiCallTime = Date.now();
    const isQuickDemoRunning = quickDemoCallbackRef.current !== null;

    setIsAnalyzing(true);
    setPredictionError(null);

    const debugData: DebugLogData = {
      simulationStartTime: simulationStartTimeRef.current,
      simulationEndTime,
      firstSample: samples[0],
      lastSample: samples[samples.length - 1],
      totalSamples: samples.length,
      apiCallTime,
    };

    try {
      const response = await apiService.predict({
        flex_sensors: samples,
        ...(currentImuRef.current ? { imu: currentImuRef.current } : {}),
        device_id: connectedDevice || 'mobile-simulator',
      });

      debugData.apiResponseTime = Date.now();
      debugData.apiResponse = response;

      setCurrentPrediction(response);
      setDebugLogData(debugData);
      setLastSampleCount(samples.length);

      setPredictionHistory(prev => [
        { letter: response.letter, confidence: response.confidence, timestamp: response.timestamp },
        ...prev.slice(0, 19),
      ]);

      // ── Continuous mode: word building ────────────────────────────────────
      if (isContinuousMode) {
        if (isQuickDemoRunning) {
          // QuickDemo batch mode: add every confident prediction immediately
          if (response.confidence >= minConfidence) {
            setDetectedLetters(prev => {
              let base = prev;
              if (isWordFinalized) { base = []; setIsWordFinalized(false); }
              return [...base, response.letter];
            });
          }
        } else {
          // Rolling window mode: require N consecutive same-letter predictions
          const STABLE_NEEDED = 4; // ~800 ms
          if (response.letter === stablePredRef.current.letter) {
            stablePredRef.current.count++;
            if (stablePredRef.current.count >= STABLE_NEEDED && !letterUsedRef.current && response.confidence >= minConfidence) {
              letterUsedRef.current = true;
              console.log(`[App] Stable letter "${response.letter}" (${stablePredRef.current.count}x) → adding to word`);
              setDetectedLetters(prev => {
                let base = prev;
                if (isWordFinalized) { base = []; setIsWordFinalized(false); }
                return [...base, response.letter];
              });
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          } else {
            // Letter changed — unlock for the new one
            stablePredRef.current = { letter: response.letter, count: 1 };
            letterUsedRef.current = false;
          }
        }
      }

      // QuickDemo: advance to next letter
      if (isQuickDemoRunning) {
        const cb = quickDemoCallbackRef.current!;
        quickDemoCallbackRef.current = null;
        cb();
      }

      // Haptic feedback — only fire when the predicted letter actually changes
      // (avoids constant vibration at API polling rate)
      if ((!isContinuousMode || isQuickDemoRunning) && response.letter !== lastHapticLetterRef.current) {
        lastHapticLetterRef.current = response.letter;
        if (response.confidence >= 0.8) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (response.confidence >= 0.6) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Prediction failed';
      setPredictionError(errorMessage);
      debugData.error = errorMessage;
      setDebugLogData(debugData);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [connectedDevice, isContinuousMode, minConfidence, isWordFinalized]);

  // Use ref to avoid recreating callbacks
  const makePredictionRef = React.useRef(makePrediction);
  React.useEffect(() => {
    makePredictionRef.current = makePrediction;
  }, [makePrediction]);

  // Handle sensor data from simulator or real WiFi device
  const handleSensorData = useCallback((data: number[]) => {
    lastSampleTimeRef.current = Date.now();

    // ── Split flex (0:5), IMU quaternion (5:9), LACC (9:12), gyro (12:15) ──────
    const flexData = data.slice(0, 5);
    if (data.length >= 9) {
      const imu: [number, number, number, number] = [data[5], data[6], data[7], data[8]];
      currentImuRef.current = imu;
    }
    // 15-column full packet: also capture LACC and gyro for Unity hand translation
    if (data.length >= 15) {
      currentMotionRef.current = {
        lx: data[9], ly: data[10], lz: data[11],
        gx: data[12], gy: data[13], gz: data[14],
      };
    }

    // ── Raw data log (throttled ~5 fps) ───────────────────────────────────────
    const nowLog = Date.now();
    if (nowLog - lastRawLogUpdateRef.current >= 200) {
      lastRawLogUpdateRef.current = nowLog;
      const flexPart = flexData.map(v => Math.round(v)).join(',');
      const imuPart = data.length >= 9
        ? ` | qw:${data[5].toFixed(4)} qx:${data[6].toFixed(4)} qy:${data[7].toFixed(4)} qz:${data[8].toFixed(4)}`
        : '';
      const line = `${flexPart}${imuPart}`;
      setRawDataLog(prev => [line, ...prev].slice(0, 10));
    }

    // ── Digital Twin: EMA runs at full 50 Hz, WebView injected at ~30 fps ───────
    // EMA must update on every sample for proper smoothing — decoupled from the
    // send throttle so we don't skip 4 out of 5 samples the way 10 fps did.
    if (twinVisibleRef.current && digitalTwinRef.current) {
      if (!twinEmaRef.current) twinEmaRef.current = [...flexData];
      twinEmaRef.current = twinEmaRef.current.map((v, i) => v + TWIN_EMA_ALPHA * (flexData[i] - v));

      // Auto-range also updates at 50 Hz so it tracks movement accurately
      if (!twinAutoRangeRef.current) {
        twinAutoRangeRef.current = {
          min: [...twinEmaRef.current],
          max: [...twinEmaRef.current],
        };
      } else {
        twinAutoRangeRef.current.min = twinAutoRangeRef.current.min.map((v, i) =>
          Math.min(v, twinEmaRef.current![i])
        );
        twinAutoRangeRef.current.max = twinAutoRangeRef.current.max.map((v, i) =>
          Math.max(v, twinEmaRef.current![i])
        );
      }

      // Send to WebView at ~30 fps (33 ms) — smooth for the user, safe for injectJavaScript
      const nowTwin = Date.now();
      if (nowTwin - twinLastSentRef.current >= 20) {
        twinLastSentRef.current = nowTwin;

        // Normalise flex:
        //   • Calibrated  → use captured baseline/maxbend (accurate)
        //   • Uncalibrated → auto-range from observed session min/max so the
        //     twin shows relative movement even before formal calibration.
        //     Convention: higher ADC = straight (0), lower ADC = bent (1).
        const calB = calibBaselinesRef.current;
        const calM = calibMaxbendsRef.current;
        const autoRange = twinAutoRangeRef.current;
        const normalizedFlex = twinEmaRef.current.map((v, i) => {
          if (isCalibrated) {
            return Math.max(0, Math.min(1, (calB[i] - v) / (calB[i] - calM[i])));
          }
          // Auto-range: expand as more movement is seen (min 50-count gap to avoid noise)
          const span = autoRange.max[i] - autoRange.min[i];
          if (span < 50) return 0; // not enough range yet — keep neutral
          return Math.max(0, Math.min(1, (autoRange.max[i] - v) / span));
        });

        // Compute relative IMU and remap axes to Unity's coordinate frame
        const imuRaw = currentImuRef.current;
        let imuXYZ = { x: 0, y: 0, z: 0 };
        let rawQuatPayload: { w: number; x: number; y: number; z: number } | null = null;
        if (imuRaw) {
          const imuQuat: Quat = { w: imuRaw[0], x: imuRaw[1], y: imuRaw[2], z: imuRaw[3] };
          if (!twinRefQuatRef.current) twinRefQuatRef.current = imuQuat;
          const qRel = qMult(qInv(twinRefQuatRef.current), imuQuat);
          // Axis remap: BNO055 frame → Unity axes (correctly-mounted sensor).
          // Negate qRel.y (→ Unity X) to fix pitch inversion after sensor correction.
          imuXYZ = { x: -qRel.y, y: qRel.z, z: -qRel.x };
          rawQuatPayload = { w: imuRaw[0], x: imuRaw[1], y: imuRaw[2], z: imuRaw[3] };
        }

        const motionRaw = lockSpatialRef.current ? null : currentMotionRef.current;
        const motionPayload = motionRaw
          ? { lx: motionRaw.lx, ly: motionRaw.ly, lz: motionRaw.lz }
          : null;
        const gyroPayload = motionRaw
          ? { gx: motionRaw.gx, gy: motionRaw.gy, gz: motionRaw.gz }
          : null;

        digitalTwinRef.current.sendSensorData(normalizedFlex, imuXYZ, rawQuatPayload, motionPayload, gyroPayload);
      }
    }

    // ── Normalize WiFi glove data ─────────────────────────────────────────────
    // Simulator already sends normalized 0-1 values.
    // A real WiFi glove sends raw thermistor ADC values (e.g. 2700, 1650 …).
    const isRawGlove =
      connectedDeviceRef.current !== null || isRawThermistorData(flexData);

    const processedData = isRawGlove
      ? normalizeSample(flexData, calibBaselinesRef.current, calibMaxbendsRef.current)
      : flexData;

    // ── Feed raw flex sample to CalibrationManager at full 50 Hz (no throttle) ──
    if (isRawGlove) calibSampleHandlerRef.current?.(flexData);

    // ── Throttled display update (~10 fps) ────────────────────────────────────
    const now = Date.now();
    if (now - lastDisplayUpdateRef.current >= 100) {
      lastDisplayUpdateRef.current = now;
      setCurrentSample(processedData);
      // Expose raw ADC integers for the sensor bar labels (real glove only)
      setRawFlexSample(isRawGlove ? [...flexData] : null);
      if (currentImuRef.current) setCurrentImu(currentImuRef.current);
    }

    // ── QuickDemo: legacy batch mode (keeps exact QuickDemo behaviour) ────────
    if (quickDemoCallbackRef.current) {
      if (!isCollectingRef.current) return;
      setSensorBuffer(prev => {
        if (!isCollectingRef.current) return prev;
        const newBuffer = [...prev, processedData];
        const target = isContinuousMode ? 150 : 200;
        if (newBuffer.length >= target) {
          isCollectingRef.current = false;
          setLastSampleCount(newBuffer.length);
          setTimeout(() => makePredictionRef.current(newBuffer), 0);
          return [];
        }
        return newBuffer;
      });
      return;
    }

    // ── Real glove / manual simulator: rolling 50-sample window ──────────────
    rollingBufferRef.current.push(processedData);
    if (rollingBufferRef.current.length > WINDOW_SIZE) {
      rollingBufferRef.current.shift();
    }

    // Fire as soon as the window is full and no call is already in-flight.
    // The API response time is the natural rate limiter.
    if (rollingBufferRef.current.length >= WINDOW_SIZE && !isPredictingRef.current) {
      isPredictingRef.current = true;
      const snapshot = [...rollingBufferRef.current];
      makePredictionRef.current(snapshot).finally(() => {
        isPredictingRef.current = false;
      });
    }
  }, [isContinuousMode, WINDOW_SIZE]);


  const handleStopSimulation = () => {
    setIsSimulating(false);
    isCollectingRef.current      = false;
    isPredictingRef.current      = false;
    setSensorBuffer([]);
    rollingBufferRef.current     = [];
    stablePredRef.current        = { letter: '', count: 0 };
    letterUsedRef.current        = false;
    lastHapticLetterRef.current  = '';
    currentImuRef.current        = null;
    currentMotionRef.current     = null;
    setCurrentImu(null);
    setRawFlexSample(null);
    setRawDataLog([]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgPrimary }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: 'transparent' }]}>
              <Text style={{ color: colors.accentPrimary }}>IoT </Text>
              <Text style={{ color: colors.accentSecondary }}>Sign Language</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('app.subtitle')}</Text>

            <View style={styles.settingsRow}>
              <Dropdown
                label={t('settings.language')}
                value={i18n.language}
                options={[
                  { label: 'English', value: 'en' },
                  { label: 'Türkçe', value: 'tr' },
                ]}
                onSelect={(value) => i18n.changeLanguage(value)}
              />

              <Dropdown
                label={t('settings.theme')}
                value={theme}
                options={[
                  { label: t('settings.light'), value: 'light' },
                  { label: t('settings.dark'), value: 'dark' },
                  { label: t('settings.system'), value: 'system' },
                ]}
                onSelect={(value) => setTheme(value as any)}
              />
            </View>
          </View>

          {/* ASL Recognition Section */}
          <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              ASL Recognition
            </Text>

            <ConnectionManager
              onDeviceConnected={setConnectedDevice}
              onDeviceDisconnected={() => {
                setConnectedDevice(null);
                rollingBufferRef.current    = [];
                isPredictingRef.current     = false;
                stablePredRef.current       = { letter: '', count: 0 };
                letterUsedRef.current       = false;
                lastHapticLetterRef.current = '';
                currentImuRef.current       = null;
                currentMotionRef.current    = null;
                setCurrentImu(null);
                setRawFlexSample(null);
                setRawDataLog([]);
                twinRefQuatRef.current      = null;
                twinEmaRef.current          = null;
                twinAutoRangeRef.current    = null;
              }}
              onDataReceived={handleSensorData}
            />

            {/* Digital Twin toggle + Lock Position row */}
            <View style={styles.twinControlRow}>
              <TouchableOpacity
                style={[
                  styles.twinToggleBtn,
                  styles.twinToggleFlex,
                  {
                    backgroundColor: twinVisible ? 'rgba(99,102,241,0.12)' : colors.bgSecondary,
                    borderColor:     twinVisible ? 'rgba(99,102,241,0.5)'  : colors.borderColor,
                  },
                ]}
                onPress={() => {
                  if (!twinVisible) {
                    twinRefQuatRef.current   = null;
                    twinEmaRef.current       = null;
                    twinAutoRangeRef.current = null;
                  }
                  setTwinVisible(v => !v);
                }}
              >
                <Text style={[styles.twinToggleTxt, { color: twinVisible ? '#818cf8' : colors.textSecondary }]}>
                  {twinVisible ? '🖼️ Hide 3D Twin' : '🖼️ 3D Digital Twin'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.twinToggleBtn,
                  {
                    backgroundColor: lockSpatial ? 'rgba(251,191,36,0.12)' : colors.bgSecondary,
                    borderColor:     lockSpatial ? 'rgba(251,191,36,0.5)'  : colors.borderColor,
                  },
                ]}
                onPress={() => {
                  const next = !lockSpatialRef.current;
                  lockSpatialRef.current = next;
                  setLockSpatial(next);
                }}
              >
                <Text style={[styles.twinToggleTxt, { color: lockSpatial ? '#d97706' : colors.textSecondary, fontSize: 13 }]}>
                  {lockSpatial ? '📍 Locked' : '🔓 Position'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Digital Twin WebGL WebView */}
            {twinVisible && (
              <DigitalTwin
                ref={digitalTwinRef}
                onClose={() => setTwinVisible(false)}
                onRecalibrate={() => {
                  twinRefQuatRef.current   = null;
                  twinEmaRef.current       = null;
                  twinAutoRangeRef.current = null;
                }}
              />
            )}

            {/* Glove calibration — only visible when a WiFi device is connected */}
            <CalibrationManager
              onRegisterSampleHandler={onRegisterCalibSampleHandler}
              isConnected={connectedDevice !== null}
              baselines={calibBaselines}
              maxbends={calibMaxbends}
              isCalibrated={isCalibrated}
              onCalibrate={(newBaselines, newMaxbends) => {
                setCalibBaselines(newBaselines);
                setCalibMaxbends(newMaxbends);
                setIsCalibrated(true);
              }}
              onReset={() => {
                setCalibBaselines(DEFAULT_BASELINES);
                setCalibMaxbends(DEFAULT_MAXBENDS);
                setIsCalibrated(false);
              }}
            />

            {/* Mode Selector */}
            <View style={[styles.modeSelector, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
              <Text style={[styles.modeLabel, { color: colors.textPrimary }]}>
                Recognition Mode:
              </Text>
              <View style={styles.modeButtons}>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    !isContinuousMode && { backgroundColor: colors.accentPrimary },
                    { borderColor: colors.borderColor }
                  ]}
                  onPress={() => {
                    setIsContinuousMode(false);
                    setIsSimulating(false);
                    isCollectingRef.current = false;
                    setSensorBuffer([]);
                  }}
                >
                  <Text style={[styles.modeButtonText, { color: !isContinuousMode ? colors.accentText : colors.textSecondary }]}>
                    Single Letter
                  </Text>
                  <Text style={[styles.modeDescription, { color: !isContinuousMode ? colors.accentText : colors.textSecondary }]}>
                    Rolling 50-sample window
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    isContinuousMode && { backgroundColor: colors.accentPrimary },
                    { borderColor: colors.borderColor }
                  ]}
                  onPress={() => {
                    setIsContinuousMode(true);
                    setSensorBuffer([]);
                    isCollectingRef.current = true;
                  }}
                >
                  <Text style={[styles.modeButtonText, { color: isContinuousMode ? colors.accentText : colors.textSecondary }]}>
                    Continuous Words
                  </Text>
                  <Text style={[styles.modeDescription, { color: isContinuousMode ? colors.accentText : colors.textSecondary }]}>
                    Stable detection (~800ms)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Demo (only in continuous mode) */}
            {isContinuousMode && (
              <QuickDemo
                onSimulateLetter={simulateLetter}
                isActive={isSimulating}
                onStopSimulator={() => {
                  console.log('[App] Stopping simulator after QuickDemo');
                  setIsSimulating(false);
                  isCollectingRef.current = false;
                }}
                quickDemoCallbackRef={quickDemoCallbackRef}
                detectedWord={detectedLetters.join('')}
                onClearWord={() => {
                  setDetectedLetters([]);
                  setCurrentPrediction(null); // Clear the prediction too!
                }}
                onResetWordFinalization={() => setIsWordFinalized(false)}
                getCurrentWord={() => detectedLettersRef.current.join('')}
              />
            )}

            <SimulatorControl
              onSensorData={handleSensorData}
              isSimulating={isSimulating}
              setIsSimulating={setIsSimulating}
              onCurrentSampleChange={setCurrentSample}
              isContinuousMode={isContinuousMode}
              simulateLetterRef={simulateLetterRef}
            />

            <SensorDisplay
              currentSample={currentSample}
              rawFlexSample={rawFlexSample}
              currentImu={currentImu}
              rawDataLog={rawDataLog}
              isActive={isSimulating || connectedDevice !== null}
            />

            <PredictionView
              prediction={currentPrediction}
              isLoading={isAnalyzing}
              error={predictionError}
              sampleCount={isAnalyzing || currentPrediction ? lastSampleCount : sensorBuffer.length}
              isContinuousMode={isContinuousMode}
              currentWord={detectedLetters.join('')}
              onClearWord={() => {
                setDetectedLetters([]);
                setCurrentPrediction(null); // Clear the prediction too!
                setIsWordFinalized(false); // Reset finalization state
              }}
              onDeleteLetter={() => setDetectedLetters(prev => prev.slice(0, -1))}
            />
            
            {/* DEBUG: Show what's being passed to PredictionView */}
            {__DEV__ && (
              <Text style={{ fontSize: 10, color: 'gray', padding: 8 }}>
                DEBUG: isContinuousMode={isContinuousMode ? 'true' : 'false'}, word="{detectedLetters.join('')}" ({detectedLetters.length} letters)
              </Text>
            )}

            <DebugLog
              data={debugLogData}
              isVisible={isDebugVisible}
              onToggle={() => setIsDebugVisible(!isDebugVisible)}
            />

            <PredictionHistory history={predictionHistory} />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t('app.footer')}</Text>
            <Text style={[styles.versionText, { color: colors.textSecondary }]}>{t('app.version')}</Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    zIndex: 10,
  },
  section: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  footer: {
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
  },
  versionText: {
    fontSize: 10,
    opacity: 0.7,
  },
  modeSelector: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  modeDescription: {
    fontSize: 10,
  },
  twinControlRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  twinToggleFlex: {
    flex: 1,
  },
  twinToggleBtn: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  twinToggleTxt: {
    fontSize: 14,
    fontWeight: '600',
  },
});
