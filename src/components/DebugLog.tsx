import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

interface DebugLogData {
  simulationStartTime?: number;
  simulationEndTime?: number;
  firstSample?: number[];
  lastSample?: number[];
  totalSamples?: number;
  apiCallTime?: number;
  apiResponseTime?: number;
  apiResponse?: {
    letter: string;
    confidence: number;
    all_probabilities: Record<string, number>;
    processing_time_ms: number;
    model_name: string;
  };
  error?: string;
}

interface DebugLogProps {
  data: DebugLogData | null;
  isVisible: boolean;
  onToggle: () => void;
}

export default function DebugLog({ data, isVisible, onToggle }: DebugLogProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (!data) return null;

  // Debug: Check if we have the response
  console.log('DebugLog - Has apiResponse:', !!data.apiResponse);
  if (data.apiResponse) {
    console.log('DebugLog - Letter:', data.apiResponse.letter);
    console.log('DebugLog - Confidence:', data.apiResponse.confidence);
    console.log('DebugLog - Has probabilities:', !!data.apiResponse.all_probabilities);
  }

  const simulationDuration = data.simulationEndTime && data.simulationStartTime 
    ? data.simulationEndTime - data.simulationStartTime 
    : 0;

  const roundTripTime = data.apiResponseTime && data.apiCallTime
    ? data.apiResponseTime - data.apiCallTime
    : 0;

  // Sort probabilities by value
  const sortedProbs = data.apiResponse?.all_probabilities
    ? Object.entries(data.apiResponse.all_probabilities)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5) // Top 5
    : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <TouchableOpacity 
        style={styles.header}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>
          {isVisible ? '▼' : '▶'} {t('debug.title')}
        </Text>
        {data.apiResponse && (
          <Text style={[styles.headerBadge, { 
            color: colors.accentText,
            backgroundColor: colors.accentPrimary 
          }]}>
            {Math.round(roundTripTime)}ms
          </Text>
        )}
      </TouchableOpacity>

      {isVisible && (
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          {/* Simulation Info */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.accentPrimary }]}>
              {t('debug.simulation')}
            </Text>
            <Text style={[styles.logText, { color: colors.textSecondary }]}>
              {t('debug.duration')} {simulationDuration.toFixed(0)}ms ({(simulationDuration / 1000).toFixed(1)}s)
            </Text>
            <Text style={[styles.logText, { color: colors.textSecondary }]}>
              {t('debug.samples')} {data.totalSamples || 0}
            </Text>
            {data.firstSample && (
              <>
                <Text style={[styles.logText, { color: colors.textSecondary }]}>
                  {t('debug.first')} [{data.firstSample.map(v => v.toFixed(0)).join(', ')}]
                </Text>
                <Text style={[styles.logText, { color: colors.textSecondary }]}>
                  {t('debug.last')}  [{data.lastSample?.map(v => v.toFixed(0)).join(', ')}]
                </Text>
              </>
            )}
          </View>

          {/* API Info */}
          {data.apiResponse && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.accentSecondary }]}>
                {t('debug.api_call')}
              </Text>
              <Text style={[styles.logText, { color: colors.textSecondary }]}>
                {t('debug.endpoint')} https://api.ybilgin.com/predict
              </Text>
              <Text style={[styles.logText, { color: colors.textSecondary }]}>
                {t('debug.round_trip')} {roundTripTime.toFixed(1)}ms
              </Text>
              <Text style={[styles.logText, { color: colors.textSecondary }]}>
                {t('debug.server_processing')} {data.apiResponse.processing_time_ms.toFixed(1)}ms
              </Text>
              <Text style={[styles.logText, { color: colors.textSecondary }]}>
                {t('debug.model')} {data.apiResponse.model_name}
              </Text>
            </View>
          )}

          {/* Prediction Results */}
          {data.apiResponse && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: '#34d399' }]}>
                {t('debug.prediction_section')}
              </Text>
              <Text style={[styles.logText, { color: colors.textPrimary, fontWeight: '700' }]}>
                {t('debug.letter')} {data.apiResponse.letter}
              </Text>
              <Text style={[styles.logText, { color: colors.textPrimary, fontWeight: '700' }]}>
                {t('debug.confidence')} {(data.apiResponse.confidence * 100).toFixed(1)}%
              </Text>
            </View>
          )}

          {/* Model Probabilities */}
          {sortedProbs.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: '#fbbf24' }]}>
                {t('debug.top5')}
              </Text>
              {sortedProbs.map(([letter, prob]) => (
                <View key={letter} style={styles.probRow}>
                  <Text style={[styles.probLetter, { color: colors.textPrimary }]}>
                    {letter}
                  </Text>
                  <View style={styles.probBarContainer}>
                    <View 
                      style={[
                        styles.probBar, 
                        { 
                          width: `${prob * 100}%`,
                          backgroundColor: prob > 0.5 ? '#34d399' : prob > 0.2 ? '#fbbf24' : '#6b7280'
                        }
                      ]} 
                    />
                  </View>
                  <Text style={[styles.probValue, { color: colors.textSecondary }]}>
                    {(prob * 100).toFixed(1)}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Error */}
          {data.error && (
            <View style={[styles.section, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={[styles.sectionTitle, { color: '#ef4444' }]}>
                {t('debug.error')}
              </Text>
              <Text style={[styles.errorText, { color: '#ef4444' }]}>
                {data.error}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerBadge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  content: {
    maxHeight: 500,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  section: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  logText: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 4,
    lineHeight: 16,
  },
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  probLetter: {
    fontSize: 12,
    fontWeight: '700',
    width: 20,
  },
  probBarContainer: {
    flex: 1,
    height: 16,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  probBar: {
    height: '100%',
    borderRadius: 4,
  },
  probValue: {
    fontSize: 11,
    fontWeight: '600',
    width: 45,
    textAlign: 'right',
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
});

