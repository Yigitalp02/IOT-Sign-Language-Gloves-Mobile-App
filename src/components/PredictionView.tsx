import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { PredictionResponse } from '../services/apiService';

interface PredictionViewProps {
  prediction: PredictionResponse | null;
  isLoading: boolean;
  error: string | null;
  sampleCount: number;
}

export default function PredictionView({ prediction, isLoading, error, sampleCount }: PredictionViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isLoading, pulseAnim]);

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#34d399'; // Green
    if (confidence >= 0.6) return '#fbbf24'; // Yellow
    if (confidence >= 0.4) return '#fb923c'; // Orange
    return '#ef4444'; // Red
  };

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444' }]}>
        <Text style={[styles.errorIcon, { color: '#ef4444' }]}>⚠</Text>
        <Text style={[styles.errorText, { color: '#ef4444' }]}>{error}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Text style={[styles.loadingIcon, { color: colors.accentPrimary }]}>🔄</Text>
        </Animated.View>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {t('prediction.analyzing')} ({sampleCount}/200)
        </Text>
      </View>
    );
  }

  if (!prediction) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.placeholderIcon, { color: colors.textSecondary }]}>👋</Text>
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
          {t('prediction.waiting')}
        </Text>
      </View>
    );
  }

  const confidenceColor = getConfidenceColor(prediction.confidence);
  const confidencePercent = Math.round(prediction.confidence * 100);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={styles.mainResult}>
        <View style={[styles.letterCircle, { borderColor: confidenceColor, backgroundColor: `${confidenceColor}20` }]}>
          <Text style={[styles.letterText, { color: confidenceColor }]}>{prediction.letter}</Text>
        </View>
        
        <View style={styles.confidence}>
          <Text style={[styles.confidenceLabel, { color: colors.textSecondary }]}>
            {t('prediction.confidence')}
          </Text>
          <Text style={[styles.confidenceValue, { color: confidenceColor }]}>
            {confidencePercent}%
          </Text>
        </View>
      </View>

      <View style={styles.metadata}>
        <View style={styles.metadataItem}>
          <Text style={[styles.metadataLabel, { color: colors.textSecondary }]}>
            {t('prediction.samples')}:
          </Text>
          <Text style={[styles.metadataValue, { color: colors.textPrimary }]}>
            {sampleCount}
          </Text>
        </View>
        <View style={styles.metadataItem}>
          <Text style={[styles.metadataLabel, { color: colors.textSecondary }]}>
            {t('prediction.time')}:
          </Text>
          <Text style={[styles.metadataValue, { color: colors.textPrimary }]}>
            {prediction.processing_time_ms.toFixed(1)}ms
          </Text>
        </View>
      </View>

      <Text style={[styles.modelInfo, { color: colors.textSecondary }]}>
        {t('prediction.model')}: {prediction.model_name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  mainResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  letterCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: {
    fontSize: 48,
    fontWeight: '800',
  },
  confidence: {
    alignItems: 'center',
  },
  confidenceLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  confidenceValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  metadata: {
    flexDirection: 'row',
    gap: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metadataLabel: {
    fontSize: 12,
  },
  metadataValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  modelInfo: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  loadingIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

