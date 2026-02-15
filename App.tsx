import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import './src/i18n/i18n';
import { useTranslation } from 'react-i18next';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import ConnectionManager from './src/components/ConnectionManager';
import SimulatorControl from './src/components/SimulatorControl';
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

  // Prediction state
  const [sensorBuffer, setSensorBuffer] = useState<number[][]>([]);
  const isCollectingRef = React.useRef(true);
  const [lastSampleCount, setLastSampleCount] = useState(0);
  const [currentPrediction, setCurrentPrediction] = useState<PredictionResponse | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [predictionHistory, setPredictionHistory] = useState<PredictionRecord[]>([]);
  
  // Real-time sensor display
  const [currentSample, setCurrentSample] = useState<number[] | null>(null);
  
  // Debug state
  const [debugLogData, setDebugLogData] = useState<DebugLogData | null>(null);
  const [isDebugVisible, setIsDebugVisible] = useState(true);
  const simulationStartTimeRef = React.useRef<number>(0);
  
  // Simulator state
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Connection state
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);

  // Word building state
  const [detectedLetters, setDetectedLetters] = useState<string[]>([]);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [minConfidence, setMinConfidence] = useState(0.6); // Threshold for auto-accept

  // QuickDemo control - notify when prediction completes
  const quickDemoCallbackRef = React.useRef<(() => void) | null>(null);

  // Handler to programmatically trigger letter simulation
  const simulateLetter = useCallback((letter: string) => {
    // Make sure we're in continuous mode
    if (!isContinuousMode) {
      setIsContinuousMode(true);
    }
    
    // Start simulation
    setIsSimulating(true);
    setCurrentSample(null);
    setSensorBuffer([]);
    isCollectingRef.current = true;
    simulationStartTimeRef.current = Date.now();
    
    // Trigger the simulator component by updating a ref
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

  // Idle detection: If no samples for 2 seconds in continuous mode, finalize the word
  React.useEffect(() => {
    if (isContinuousMode && isSimulating && detectedLetters.length > 0) {
      // Clear existing idle timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      // Set a new idle timer
      idleTimerRef.current = setTimeout(() => {
        const timeSinceLastSample = Date.now() - lastSampleTimeRef.current;
        if (timeSinceLastSample >= 2000) {
          console.log('[Continuous mode] No samples for 2s - finalizing word');
          handleStopSimulation();
          
          // Speak the complete word
          const finalWord = detectedLetters.join('');
          if (finalWord.length > 0) {
            Speech.speak(finalWord, {
              language: 'en-US',
              rate: 0.8,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      }, 2500); // Check 2.5 seconds after last sample
    }

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [isContinuousMode, isSimulating, detectedLetters]);

  const makePrediction = useCallback(async (samples: number[][]) => {
    const simulationEndTime = Date.now();
    const apiCallTime = Date.now();
    
    console.log(`Making prediction with ${samples.length} samples`);
    setIsAnalyzing(true);
    setPredictionError(null);

    // Prepare debug data
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

      const apiResponseTime = Date.now();
      debugData.apiResponseTime = apiResponseTime;
      debugData.apiResponse = response;

      setCurrentPrediction(response);
      setDebugLogData(debugData);
      
      // Add to history
      setPredictionHistory(prev => [
        {
          letter: response.letter,
          confidence: response.confidence,
          timestamp: response.timestamp,
        },
        ...prev.slice(0, 19), // Keep last 20
      ]);

      // Auto-add to word builder in continuous mode
      // For QuickDemo: ALWAYS add (regardless of confidence) for demo purposes
      // For manual continuous: Only add if confidence >= threshold
      const isQuickDemoRunning = quickDemoCallbackRef.current !== null; // Check BEFORE clearing!
      console.log(`[App] Continuous mode: ${isContinuousMode}, QuickDemo: ${isQuickDemoRunning}, Confidence: ${Math.round(response.confidence * 100)}%`);
      if (isContinuousMode) {
        if (isQuickDemoRunning || response.confidence >= minConfidence) {
          setDetectedLetters(prev => {
            const newLetters = [...prev, response.letter];
            console.log(`[App] Added letter "${response.letter}" to word. Current word: "${newLetters.join('')}"`);
            return newLetters;
          });
        } else {
          console.log(`[App] Skipping letter "${response.letter}" - confidence ${Math.round(response.confidence * 100)}% < ${Math.round(minConfidence * 100)}%`);
        }
      } else {
        console.log(`[App] NOT in continuous mode, letter will NOT be added to word`);
      }

      // Notify QuickDemo that prediction is complete (if waiting)
      if (quickDemoCallbackRef.current) {
        console.log('[App] Notifying QuickDemo that prediction is complete');
        const callback = quickDemoCallbackRef.current;
        quickDemoCallbackRef.current = null; // Clear it AFTER checking
        callback(); // Trigger next letter
      }

      // Haptic feedback
      if (response.confidence >= 0.8) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (response.confidence >= 0.6) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      // Only speak letter in SINGLE LETTER mode, NOT in continuous mode
      if (!isContinuousMode) {
        Speech.speak(response.letter, {
          language: 'en-US',
          rate: 0.8,
        });
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
  }, [connectedDevice, isContinuousMode, minConfidence]); // ADD isContinuousMode!

  // Use ref to avoid recreating callbacks
  const makePredictionRef = React.useRef(makePrediction);
  React.useEffect(() => {
    makePredictionRef.current = makePrediction;
  }, [makePrediction]);

  // Handle sensor data from simulator or real device
  const handleSensorData = useCallback((data: number[]) => {
    // Update last sample time for idle detection
    lastSampleTimeRef.current = Date.now();
    
    // Check if we should still be collecting (BEFORE setState!)
    if (!isCollectingRef.current) {
      console.log('Ignoring sample - collection stopped');
      return;
    }

    setSensorBuffer(prev => {
      // Double-check inside setState too
      if (!isCollectingRef.current) {
        console.log('Ignoring sample - collection stopped (inside setState)');
        return prev;
      }

      const newBuffer = [...prev, data];
      console.log(`Buffer now has ${newBuffer.length} samples`);
      
      // When we have 100 samples (2 seconds at 50Hz) in continuous mode, or 200 in single mode
      const targetSamples = isContinuousMode ? 100 : 200;
      console.log(`Target samples: ${targetSamples} (continuous mode: ${isContinuousMode})`);
      
      if (newBuffer.length >= targetSamples) {
        console.log(`Triggering prediction with ${newBuffer.length} samples`);
        isCollectingRef.current = false; // Stop collecting immediately!
        if (!isContinuousMode) {
          setIsSimulating(false); // Only stop UI in manual mode
        }
        setLastSampleCount(newBuffer.length); // Save count for display
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Make prediction on next tick to avoid race conditions
        setTimeout(() => makePredictionRef.current(newBuffer), 0);
        return [];
      }
      
      return newBuffer;
    });
  }, [isContinuousMode]); // ADD isContinuousMode to dependencies!

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
    isCollectingRef.current = false;
    setSensorBuffer([]);
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
                    200 samples (4s)
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
                    100 samples (2s)
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
              />
            )}

            <ConnectionManager
              onDeviceConnected={setConnectedDevice}
              onDeviceDisconnected={() => setConnectedDevice(null)}
              onDataReceived={handleSensorData}
            />

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
              onClearWord={() => setDetectedLetters([])}
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
