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
}

// ASL patterns for 15 distinguishable letters (calibrated for our sensor range)
// Converted from normalized values (0-1) to raw ADC values using baselines and maxbends
// Source: iot-sign-glove/scripts/synthetic_asl_simulator.py
const BASELINES = [440, 612, 618, 548, 528]; // thumb, index, middle, ring, pinky
const MAXBENDS = [650, 900, 900, 850, 800];

function denormalize(normalized: number[], baselines: number[], maxbends: number[]): number[] {
  return normalized.map((val, i) => Math.round(baselines[i] + val * (maxbends[i] - baselines[i])));
}

const ASL_PATTERNS: Record<string, number[]> = {
  A: denormalize([0.02, 0.68, 0.78, 0.65, 0.68], BASELINES, MAXBENDS),
  B: denormalize([0.42, 0.13, 0.24, 0.26, 0.32], BASELINES, MAXBENDS),
  C: denormalize([0.31, 0.56, 0.70, 0.59, 0.59], BASELINES, MAXBENDS),
  D: denormalize([0.40, 0.04, 0.74, 0.64, 0.66], BASELINES, MAXBENDS),
  E: denormalize([0.53, 0.61, 0.81, 0.64, 0.64], BASELINES, MAXBENDS),
  F: denormalize([0.44, 0.43, 0.13, 0.22, 0.33], BASELINES, MAXBENDS),
  I: denormalize([0.47, 0.68, 0.74, 0.66, 0.22], BASELINES, MAXBENDS),
  K: denormalize([0.13, 0.00, 0.35, 0.65, 0.68], BASELINES, MAXBENDS),
  O: denormalize([0.50, 0.50, 0.58, 0.58, 0.54], BASELINES, MAXBENDS),
  S: denormalize([0.55, 0.67, 0.74, 0.68, 0.69], BASELINES, MAXBENDS),
  T: denormalize([0.33, 0.20, 0.67, 0.63, 0.68], BASELINES, MAXBENDS),
  V: denormalize([0.26, 0.03, 0.02, 0.72, 0.65], BASELINES, MAXBENDS),
  W: denormalize([0.23, 0.12, 0.11, 0.22, 0.73], BASELINES, MAXBENDS),
  X: denormalize([0.38, 0.47, 0.71, 0.65, 0.71], BASELINES, MAXBENDS),
  Y: denormalize([0.00, 0.58, 0.71, 0.65, 0.24], BASELINES, MAXBENDS),
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'K', 'O', 'S', 'T', 'V', 'W', 'X', 'Y'];

export default function SimulatorControl({ onSensorData, isSimulating, setIsSimulating, onCurrentSampleChange }: SimulatorControlProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);

  useEffect(() => {
    if (!isSimulating || !selectedLetter) return;

    const interval = setInterval(() => {
      const basePattern = ASL_PATTERNS[selectedLetter];
      if (!basePattern) return;

      // Add realistic noise (±8) and round to integers
      const noisyData = basePattern.map(value => 
        Math.round(Math.max(0, Math.min(1023, value + Math.random() * 16 - 8)))
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
            {t('simulator.simulating')}: {selectedLetter} ({sampleCount}/200)
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

