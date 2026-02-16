import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface SensorDisplayProps {
  currentSample: number[] | null;
  isActive: boolean;
}

const SensorDisplay: React.FC<SensorDisplayProps> = ({ currentSample, isActive }) => {
  const { colors } = useTheme();

  const getBarWidth = (value: number, min: number = 0, max: number = 1023) => {
    return `${((value - min) / (max - min)) * 100}%`;
  };

  const getBarColor = (value: number) => {
    if (value < 341) return '#ef4444'; // Red - low flex
    if (value < 682) return '#fbbf24'; // Yellow - medium flex
    return '#10b981'; // Green - high flex
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Real-Time Sensor Values
        </Text>
        <View style={[
          styles.statusDot,
          { backgroundColor: isActive ? '#10b981' : colors.textSecondary }
        ]} />
      </View>

      {!currentSample || currentSample.length === 0 ? (
        <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
          No sensor data yet...
        </Text>
      ) : (
        <View style={styles.sensorsContainer}>
          {currentSample.map((value, index) => (
            <View key={index} style={styles.sensorRow}>
              {/* Sensor Label */}
              <Text style={[styles.sensorLabel, { color: colors.textPrimary }]}>
                CH{index}
              </Text>

              {/* Progress Bar */}
              <View style={[styles.barContainer, { backgroundColor: colors.bgPrimary }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: getBarWidth(value),
                      backgroundColor: getBarColor(value),
                    }
                  ]}
                />
              </View>

              {/* Numeric Value */}
              <Text style={[styles.valueText, { color: colors.textPrimary }]}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Legend */}
      {currentSample && currentSample.length > 0 && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>0-340</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>341-681</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>682-1023</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noDataText: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  sensorsContainer: {
    gap: 10,
  },
  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sensorLabel: {
    fontSize: 11,
    fontWeight: '600',
    width: 28,
  },
  barContainer: {
    flex: 1,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 10,
    transition: 'width 0.1s ease-out',
  },
  valueText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
    width: 36,
    textAlign: 'right',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
  },
});

export default SensorDisplay;



