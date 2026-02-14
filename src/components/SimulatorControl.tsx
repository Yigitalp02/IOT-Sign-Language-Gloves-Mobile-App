import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import * as Haptics from 'expo-haptics';

interface SimulatorControlProps {
  onSensorData: (data: number[]) => void;
  isSimulating: boolean;
  setIsSimulating: (value: boolean) => void;
}

// ASL patterns for 15 distinguishable letters (calibrated for our sensor range)
const ASL_PATTERNS: Record<string, number[]> = {
  A: [446, 824, 698, 625, 599],
  B: [400, 400, 400, 400, 400],
  C: [450, 520, 500, 480, 460],
  D: [850, 450, 800, 780, 760],
  E: [900, 850, 880, 860, 840],
  F: [590, 753, 620, 550, 529],
  I: [850, 850, 850, 450, 850],
  K: [450, 580, 700, 800, 850],
  O: [650, 700, 720, 700, 680],
  S: [850, 850, 850, 850, 850],
  T: [850, 450, 850, 850, 850],
  V: [450, 450, 750, 850, 850],
  W: [450, 450, 450, 800, 850],
  X: [750, 450, 850, 850, 850],
  Y: [450, 850, 850, 850, 450],
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'K', 'O', 'S', 'T', 'V', 'W', 'X', 'Y'];

export default function SimulatorControl({ onSensorData, isSimulating, setIsSimulating }: SimulatorControlProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);

  useEffect(() => {
    if (!isSimulating || !selectedLetter) return;

    const interval = setInterval(() => {
      const basePattern = ASL_PATTERNS[selectedLetter];
      if (!basePattern) return;

      // Add realistic noise (±8)
      const noisyData = basePattern.map(value => 
        Math.max(0, Math.min(1023, value + Math.random() * 16 - 8))
      );

      onSensorData(noisyData);
      setSampleCount(prev => {
        const newCount = prev + 1;
        if (newCount >= 200) {
          setIsSimulating(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return newCount;
      });
    }, 20); // 50Hz sampling

    return () => clearInterval(interval);
  }, [isSimulating, selectedLetter, onSensorData, setIsSimulating]);

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

