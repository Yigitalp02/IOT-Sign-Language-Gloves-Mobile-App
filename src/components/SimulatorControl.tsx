import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import * as Haptics from 'expo-haptics';

interface SimulatorControlProps {
  onSensorData: (data: number[]) => void;
  isSimulating: boolean;
  setIsSimulating: (value: boolean) => void;
  onCurrentSampleChange?: (data: number[]) => void;
  isContinuousMode?: boolean;
  simulateLetterRef?: React.MutableRefObject<string | null>;
}

/**
 * ASL patterns: normalized 0-1 values where 0 = straight, 1 = bent.
 * These are the EXACT patterns used by the desktop simulator — the model
 * was trained on data derived from these same normalized values.
 * Order: [thumb, index, middle, ring, pinky]
 */
const ASL_PATTERNS: Record<string, number[]> = {
  A: [0.00, 1.00, 0.90, 1.00, 1.00],
  B: [0.74, 0.05, 0.06, 0.10, 0.13],
  C: [0.00, 1.00, 0.85, 0.98, 0.86],
  D: [0.09, 0.05, 0.85, 1.00, 0.79],
  E: [0.88, 1.00, 0.97, 1.00, 0.97],
  F: [0.04, 0.52, 0.11, 0.26, 0.28],
  I: [0.83, 0.99, 0.85, 0.98, 0.20],
  K: [0.04, 0.53, 0.21, 0.87, 0.50],
  O: [0.02, 0.91, 0.81, 0.98, 0.78],
  S: [0.57, 0.92, 0.87, 1.00, 0.96],
  T: [0.07, 0.88, 0.88, 1.00, 1.00],
  V: [0.55, 0.31, 0.19, 0.94, 0.81],
  W: [0.72, 0.09, 0.03, 0.15, 0.90],
  X: [0.48, 0.33, 0.77, 0.92, 0.91],
  Y: [0.01, 0.98, 0.91, 0.95, 0.03],
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'K', 'O', 'S', 'T', 'V', 'W', 'X', 'Y'];

export default function SimulatorControl({ 
  onSensorData, 
  isSimulating, 
  setIsSimulating, 
  onCurrentSampleChange, 
  isContinuousMode = false,
  simulateLetterRef 
}: SimulatorControlProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);

  // Watch for programmatic letter simulation from QuickDemo
  React.useEffect(() => {
    if (simulateLetterRef && simulateLetterRef.current) {
      const letter = simulateLetterRef.current;
      console.log(`[SimulatorControl] Programmatic trigger for letter: ${letter}`);
      simulateLetterRef.current = null; // Clear the ref immediately
      
      // Stop any existing simulation first
      if (isSimulating && selectedLetter !== letter) {
        console.log(`[SimulatorControl] Switching from ${selectedLetter} to ${letter}`);
      }
      
      setSelectedLetter(letter);
      setSampleCount(0);
      // Don't set isSimulating here - it's already set by the parent
    }
  }, [simulateLetterRef?.current]);

  useEffect(() => {
    if (!isSimulating || !selectedLetter) return;

    const interval = setInterval(() => {
      const basePattern = ASL_PATTERNS[selectedLetter];
      if (!basePattern) return;

      // Realistic noise ±0.015 (equivalent to ±8 ADC counts on raw range ~500)
      const noisyData = basePattern.map(value =>
        Math.round(Math.max(0, Math.min(1, value + (Math.random() * 0.03 - 0.015))) * 10000) / 10000
      );

      onSensorData(noisyData);
      if (onCurrentSampleChange) {
        onCurrentSampleChange(noisyData); // Send to real-time display
      }
      setSampleCount(prev => prev + 1);
    }, 20); // 50Hz sampling

    return () => clearInterval(interval);
  }, [isSimulating, selectedLetter, onSensorData, onCurrentSampleChange]);

  const handleLetterPress = async (letter: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedLetter(letter);
    setSampleCount(0);
    setIsSimulating(true);
  };

  const handleStop = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsSimulating(false);
    setSampleCount(0);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('simulator.title')}</Text>
        {isSimulating && (
          <TouchableOpacity
            style={[styles.stopButton, { backgroundColor: '#ef4444' }]}
            onPress={handleStop}
          >
            <Text style={styles.stopButtonText}>⏹ {t('buttons.stop')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {t('simulator.description')}
      </Text>

      {isSimulating && selectedLetter && (
        <View style={[styles.status, { backgroundColor: colors.accentPrimary + '20', borderColor: colors.accentPrimary }]}>
          <Text style={[styles.statusText, { color: colors.accentPrimary }]}>
            {isContinuousMode 
              ? `${t('simulator.simulating')}: ${selectedLetter} (continuous mode)`
              : `${t('simulator.simulating')}: ${selectedLetter} (${sampleCount}/200)`
            }
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.letterGrid} showsVerticalScrollIndicator={false}>
        {LETTERS.map(letter => (
          <TouchableOpacity
            key={letter}
            style={[
              styles.letterButton,
              {
                backgroundColor: selectedLetter === letter && isSimulating 
                  ? colors.accentPrimary 
                  : colors.bgSecondary,
                borderColor: colors.borderColor,
              },
            ]}
            onPress={() => handleLetterPress(letter)}
            disabled={isSimulating}
          >
            <Text
              style={[
                styles.letterButtonText,
                {
                  color: selectedLetter === letter && isSimulating 
                    ? colors.accentText 
                    : colors.textPrimary,
                },
              ]}
            >
              {letter}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  stopButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
    marginBottom: 12,
  },
  status: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  letterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  letterButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterButtonText: {
    fontSize: 20,
    fontWeight: '700',
  },
});

