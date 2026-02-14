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
  
  // Debug state
  const [debugLogData, setDebugLogData] = useState<DebugLogData | null>(null);
  const [isDebugVisible, setIsDebugVisible] = useState(true);
  const simulationStartTimeRef = React.useRef<number>(0);
  
  // Simulator state
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Connection state
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);

  // Reset collecting flag when starting simulation
  React.useEffect(() => {
    if (isSimulating) {
      isCollectingRef.current = true;
      simulationStartTimeRef.current = Date.now();
    }
  }, [isSimulating]);

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

      // Haptic feedback
      if (response.confidence >= 0.8) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (response.confidence >= 0.6) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      // Speak the letter
      Speech.speak(response.letter, {
        language: 'en-US',
        rate: 0.8,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Prediction failed';
      setPredictionError(errorMessage);
      debugData.error = errorMessage;
      setDebugLogData(debugData);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [connectedDevice]);

  // Use ref to avoid recreating callbacks
  const makePredictionRef = React.useRef(makePrediction);
  React.useEffect(() => {
    makePredictionRef.current = makePrediction;
  }, [makePrediction]);

  // Handle sensor data from simulator or real device
  const handleSensorData = useCallback((data: number[]) => {
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
      
      // When we have 200 samples, make prediction
      if (newBuffer.length >= 200) {
        console.log('Triggering prediction with 200 samples');
        isCollectingRef.current = false; // Stop collecting immediately!
        setIsSimulating(false); // Update UI
        setLastSampleCount(newBuffer.length); // Save count for display
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Make prediction on next tick to avoid race conditions
        setTimeout(() => makePredictionRef.current(newBuffer), 0);
        return [];
      }
      
      return newBuffer;
    });
  }, []); // Empty deps - function never changes!

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
              onDeviceDisconnected={() => setConnectedDevice(null)}
              onDataReceived={handleSensorData}
            />

            <SimulatorControl
              onSensorData={handleSensorData}
              isSimulating={isSimulating}
              setIsSimulating={setIsSimulating}
            />

            <PredictionView
              prediction={currentPrediction}
              isLoading={isAnalyzing}
              error={predictionError}
              sampleCount={isAnalyzing || currentPrediction ? lastSampleCount : sensorBuffer.length}
            />

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
});
