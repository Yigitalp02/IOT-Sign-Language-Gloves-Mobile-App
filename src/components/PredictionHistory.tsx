import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

interface PredictionRecord {
  letter: string;
  confidence: number;
  timestamp: number;
}

interface PredictionHistoryProps {
  history: PredictionRecord[];
}

export default function PredictionHistory({ history }: PredictionHistoryProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (history.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {t('history.empty')}
        </Text>
      </View>
    );
  }

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#34d399';
    if (confidence >= 0.6) return '#fbbf24';
    if (confidence >= 0.4) return '#fb923c';
    return '#ef4444';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('history.title')}</Text>
      
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {history.map((record, index) => {
          const confidenceColor = getConfidenceColor(record.confidence);
          const time = new Date(record.timestamp * 1000);
          const timeStr = time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit',
          });

          return (
            <View 
              key={index} 
              style={[styles.historyItem, { borderBottomColor: colors.borderColor }]}
            >
              <View style={[styles.letterBadge, { backgroundColor: `${confidenceColor}20`, borderColor: confidenceColor }]}>
                <Text style={[styles.letterBadgeText, { color: confidenceColor }]}>
                  {record.letter}
                </Text>
              </View>
              
              <View style={styles.itemDetails}>
                <Text style={[styles.confidenceText, { color: confidenceColor }]}>
                  {Math.round(record.confidence * 100)}%
                </Text>
                <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                  {timeStr}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {history.length > 0 && (
        <Text style={[styles.countText, { color: colors.textSecondary }]}>
          {t('history.count', { count: history.length })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    maxHeight: 300,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  list: {
    flex: 1,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  letterBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBadgeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  itemDetails: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confidenceText: {
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
  },
  countText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});


