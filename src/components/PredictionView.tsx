import React from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { PredictionResponse } from '../services/apiService';
import * as Speech from 'expo-speech';

// Import ASL sign images
const ASL_SIGNS: { [key: string]: any } = {
  A: require('../../assets/asl/A.png'),
  B: require('../../assets/asl/B.png'),
  C: require('../../assets/asl/C.png'),
  D: require('../../assets/asl/D.png'),
  E: require('../../assets/asl/E.png'),
  F: require('../../assets/asl/F.png'),
  I: require('../../assets/asl/I.png'),
  K: require('../../assets/asl/K.png'),
  O: require('../../assets/asl/O.png'),
  S: require('../../assets/asl/S.png'),
  T: require('../../assets/asl/T.png'),
  V: require('../../assets/asl/V.png'),
  W: require('../../assets/asl/W.png'),
  X: require('../../assets/asl/X.png'),
  Y: require('../../assets/asl/Y.png'),
};

interface PredictionViewProps {
  prediction: PredictionResponse | null;
  isLoading: boolean;
  error: string | null;
  sampleCount: number;
  isContinuousMode?: boolean;
  currentWord?: string;
  onClearWord?: () => void;
  onDeleteLetter?: () => void;
}

export default function PredictionView({ prediction, isLoading, error, sampleCount, isContinuousMode = false, currentWord = '', onClearWord, onDeleteLetter }: PredictionViewProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // DEBUG: Log props to see what we're receiving
  React.useEffect(() => {
    console.log(`[PredictionView] Props - isContinuousMode: ${isContinuousMode}, currentWord: "${currentWord}" (${currentWord.length} letters), prediction: ${prediction?.letter || 'null'}`);
  }, [isContinuousMode, currentWord, prediction]);

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
        <Text style={[styles.errorIcon, { color: '#ef4444' }]}>!</Text>
        <Text style={[styles.errorText, { color: '#ef4444' }]}>{error}</Text>
      </View>
    );
  }

  // Only replace the whole view with a spinner when there is no result yet.
  // Once we have a prediction, keep showing it during subsequent API calls
  // (rolling window fires every 200ms — replacing the view each time causes flicker).
  if (isLoading && !prediction) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Text style={[styles.loadingIcon, { color: colors.accentPrimary }]}>...</Text>
        </Animated.View>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {t('prediction.analyzing')}
        </Text>
      </View>
    );
  }

  // In continuous mode, show the word being built (PRIORITY over individual letter)
  if (isContinuousMode && currentWord.length > 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        {/* Live indicator — visible while rolling predictions are in-flight */}
        {isLoading && (
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, { backgroundColor: colors.accentPrimary }]} />
            <Text style={[styles.liveText, { color: colors.accentPrimary }]}>LIVE</Text>
          </View>
        )}
        <View style={styles.mainResult}>
          <View style={[styles.wordBox, { borderColor: colors.accentPrimary, backgroundColor: `${colors.accentPrimary}20` }]}>
            <Text style={[styles.wordText, { color: colors.accentPrimary }]}>{currentWord}</Text>
          </View>
        </View>
        
        {/* ASL Sign Images for each letter */}
        <View style={styles.aslSignsContainer}>
          {currentWord.split('').map((letter, index) => (
            <View key={`${letter}-${index}`} style={styles.aslSignWrapper}>
              {ASL_SIGNS[letter] && (
                <Image 
                  source={ASL_SIGNS[letter]} 
                  style={[
                    styles.aslSignImage,
                    isDark && { tintColor: '#ffffff' }
                  ]}
                  resizeMode="contain"
                />
              )}
              <Text style={[styles.aslSignLabel, { color: colors.textSecondary }]}>{letter}</Text>
            </View>
          ))}
        </View>
        
        <Text style={[styles.continuousModeHint, { color: colors.textSecondary }]}>
          {currentWord.length} letter{currentWord.length !== 1 ? 's' : ''} detected
        </Text>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.accentPrimary }]}
            onPress={() => {
              if (currentWord) {
                Speech.speak(currentWord, { language: 'en-US', rate: 0.8 });
              }
            }}
          >
            <Text style={styles.actionButtonText}>Speak</Text>
          </TouchableOpacity>

          {onDeleteLetter && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#fb923c' }]}
              onPress={onDeleteLetter}
            >
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          )}

          {onClearWord && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#ef4444' }]}
              onPress={onClearWord}
            >
              <Text style={styles.actionButtonText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {prediction && (
          <View style={styles.metadata}>
            <View style={styles.metadataItem}>
              <Text style={[styles.metadataLabel, { color: colors.textSecondary }]}>
                Last letter:
              </Text>
              <Text style={[styles.metadataValue, { color: colors.textPrimary }]}>
                {prediction.letter}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={[styles.metadataLabel, { color: colors.textSecondary }]}>
                Confidence:
              </Text>
              <Text style={[styles.metadataValue, { color: getConfidenceColor(prediction.confidence) }]}>
                {Math.round(prediction.confidence * 100)}%
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (!prediction) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
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
      {/* Live indicator — visible while rolling predictions are in-flight */}
      {isLoading && (
        <View style={styles.liveIndicator}>
          <View style={[styles.liveDot, { backgroundColor: colors.accentPrimary }]} />
          <Text style={[styles.liveText, { color: colors.accentPrimary }]}>LIVE</Text>
        </View>
      )}
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

      {/* ASL Sign Image for single letter */}
      {ASL_SIGNS[prediction.letter] && (
        <View style={styles.singleLetterSignContainer}>
          <Image 
            source={ASL_SIGNS[prediction.letter]} 
            style={[
              styles.singleLetterSignImage,
              isDark && { tintColor: '#ffffff' }
            ]}
            resizeMode="contain"
          />
          <Text style={[styles.signHintText, { color: colors.textSecondary }]}>
            ASL Sign for "{prediction.letter}"
          </Text>
        </View>
      )}

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
  wordBox: {
    minWidth: 120,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordText: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 4,
  },
  continuousModeHint: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: -8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  liveIndicator: {
    position: 'absolute',
    top: 10,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
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
  aslSignsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  aslSignWrapper: {
    alignItems: 'center',
    width: 70,
  },
  aslSignImage: {
    width: 60,
    height: 60,
    marginBottom: 4,
  },
  aslSignLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  singleLetterSignContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  singleLetterSignImage: {
    width: 120,
    height: 120,
    marginBottom: 8,
  },
  signHintText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});

