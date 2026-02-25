import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// ── Constants ──────────────────────────────────────────────────────────────
const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

// ── Helpers ────────────────────────────────────────────────────────────────
/**
 * Normalized value (0=straight, 1=bent) → bar color.
 * Matches the desktop app's color meaning: straight = green, bent = red.
 *   0.0 (straight) → green
 *   0.5 (mid)      → amber
 *   1.0 (bent)     → red
 */
function barColor(value: number): string {
  if (value < 0.33) return '#10b981'; // green — straight / relaxed
  if (value < 0.67) return '#fbbf24'; // amber — partially bent
  return '#ef4444';                   // red   — bent / flexed
}

/** Format normalized value for display */
function fmt(value: number): string {
  return value.toFixed(2);
}

// ── Types ──────────────────────────────────────────────────────────────────
interface SensorDisplayProps {
  currentSample: number[] | null;
  isActive: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────
const SensorDisplay: React.FC<SensorDisplayProps> = ({ currentSample, isActive }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Real-Time Sensor Values</Text>
        <View style={[styles.statusDot, { backgroundColor: isActive ? '#10b981' : colors.textSecondary }]} />
      </View>

      {!currentSample || currentSample.length === 0 ? (
        <Text style={[styles.noData, { color: colors.textSecondary }]}>No sensor data yet…</Text>
      ) : (
        <View style={styles.rows}>
          {currentSample.map((value, i) => {
            const clampedValue = Math.max(0, Math.min(1, value));
            const widthPct     = `${clampedValue * 100}%` as const;
            const color        = barColor(clampedValue);
            return (
              <View key={i} style={styles.row}>
                {/* Finger label */}
                <Text style={[styles.label, { color: colors.textPrimary }]}>
                  {FINGER_NAMES[i] ?? `CH${i}`}
                </Text>

                {/* Bar */}
                <View style={[styles.track, { backgroundColor: colors.bgPrimary }]}>
                  <View style={[styles.fill, { width: widthPct, backgroundColor: color }]} />
                </View>

                {/* Value */}
                <Text style={[styles.value, { color: colors.textPrimary }]}>{fmt(clampedValue)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Legend */}
      {currentSample && currentSample.length > 0 && (
        <View style={[styles.legend, { borderTopColor: colors.borderColor }]}>
          <LegendItem color="#10b981" label="Straight (0–0.33)" />
          <LegendItem color="#fbbf24" label="Partial (0.34–0.66)" />
          <LegendItem color="#ef4444" label="Bent (0.67–1)" />
        </View>
      )}
    </View>
  );
};

// ── Legend item ─────────────────────────────────────────────────────────────
const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  title:     { fontSize: 14, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  noData:    { fontSize: 12, textAlign: 'center', paddingVertical: 16 },
  rows:      { gap: 8 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label:     { fontSize: 11, fontWeight: '600', width: 46 },
  track:     { flex: 1, height: 18, borderRadius: 9, overflow: 'hidden' },
  fill:      { height: '100%', borderRadius: 9 },
  value:     { fontSize: 11, fontWeight: '600', fontFamily: 'monospace', width: 34, textAlign: 'right' },
  legend: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginTop: 10, paddingTop: 8, borderTopWidth: 1,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10 },
});

export default SensorDisplay;
