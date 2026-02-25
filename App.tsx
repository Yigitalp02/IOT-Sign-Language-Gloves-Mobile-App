import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import './src/i18n/i18n';
import { useTranslation } from 'react-i18next';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import ConnectionManager from './src/components/ConnectionManager';
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
  
  // Text-to-Speech state
  const [text, setText] = useState('');
  const [ttsStatus, setTtsStatus] = useState('');

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
  const lastDisplayUpdateRef = React.useRef(0);
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
  const stablePredRef    = React.useRef<{ letter: string; count: number }>({ letter: '', count: 0 });
  const letterUsedRef    = React.useRef(false); // prevent re-adding same stable letter
  const lastSpokenLetterRef = React.useRef<string>(''); // TTS: only speak when letter changes

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

      // Haptic feedback (only in non-rolling path to avoid double-haptic)
      if (!isContinuousMode || isQuickDemoRunning) {
        if (response.confidence >= 0.8) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (response.confidence >= 0.6) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }

      // Speak letter in single-letter mode only — once per letter change
      if (!isContinuousMode && response.letter !== lastSpokenLetterRef.current) {
        lastSpokenLetterRef.current = response.letter;
        Speech.speak(response.letter, { language: 'en-US', rate: 0.8 });
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

  // Handle sensor data from simulator or real BLE device
  const handleSensorData = useCallback((data: number[]) => {
    lastSampleTimeRef.current = Date.now();

    // ── Normalize BLE glove data ─────────────────────────────────────────────
    // Simulator already sends normalized 0-1 values.
    // A real BLE glove sends raw thermistor ADC values (e.g. 2700, 1650 …).
    const isRawGlove =
      connectedDeviceRef.current !== null || isRawThermistorData(data);

    const processedData = isRawGlove
      ? normalizeSample(data, calibBaselinesRef.current, calibMaxbendsRef.current)
      : data;

    // ── Feed raw sample to CalibrationManager at full 50 Hz (no throttle) ────
    if (isRawGlove) calibSampleHandlerRef.current?.(data);

    // ── Throttled display update (~10 fps) ────────────────────────────────────
    // Show the normalized values so the sensor bars always reflect 0-1 scale.
    const now = Date.now();
    if (now - lastDisplayUpdateRef.current >= 100) {
      lastDisplayUpdateRef.current = now;
      setCurrentSample(processedData);
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

  const handleSpeak = (language: string) => {
    if (!text.trim()) {
      setTtsStatus(t('status.error_empty'));
      return;
    }

    setTtsStatus(language === 'tr-TR' ? t('status.speaking_tr') : t('status.speaking_en'));

    Speech.speak(text, {
      language,
      onDone: () => setTtsStatus(language === 'tr-TR' ? t('status.success_tr') : t('status.success_en')),
      onError: (e) => setTtsStatus(`Error: ${e}`),
    });
  };

  const handleStopSimulation = () => {
    setIsSimulating(false);
    isCollectingRef.current      = false;
    isPredictingRef.current      = false;
    setSensorBuffer([]);
    rollingBufferRef.current     = [];
    stablePredRef.current        = { letter: '', count: 0 };
    letterUsedRef.current        = false;
    lastSpokenLetterRef.current  = ''; // reset so next start speaks immediately
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
                lastSpokenLetterRef.current = '';
              }}
              onDataReceived={handleSensorData}
            />

            {/* Glove calibration — only visible when a BLE device is connected */}
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

          {/* Text-to-Speech Section */}
          <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Text-to-Speech
            </Text>

            <View style={styles.inputSection}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('input.label')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.borderColor, color: colors.textPrimary }]}
                multiline
                numberOfLines={4}
                value={text}
                onChangeText={setText}
                placeholder={t('input.placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accentPrimary }]}
                onPress={() => handleSpeak('tr-TR')}
              >
                <Text style={[styles.buttonText, { color: colors.accentText }]}>{t('buttons.speak_tr')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}
                onPress={() => handleSpeak('en-US')}
              >
                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('buttons.speak_en')}</Text>
              </TouchableOpacity>
            </View>

            {!!ttsStatus && (
              <View style={[styles.statusMessage, { backgroundColor: colors.statusBg, borderColor: colors.borderColor }]}>
                <Text style={{ color: colors.textPrimary, textAlign: 'center' }}>{ttsStatus}</Text>
              </View>
            )}
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
  inputSection: {
    gap: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  secondaryButton: {
    borderWidth: 1,
    elevation: 0,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusMessage: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
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
});
