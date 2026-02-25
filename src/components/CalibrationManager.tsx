import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { DEFAULT_BASELINES, DEFAULT_MAXBENDS } from '../utils/normalization';

// ── Constants ────────────────────────────────────────────────────────────────
const CAPTURE_SAMPLES = 100; // 2 seconds at 50 Hz
const FINGER_NAMES    = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

// ── Types ────────────────────────────────────────────────────────────────────
type CaptureStep = 'idle' | 'straight' | 'bent' | 'done';

interface CalibrationManagerProps {
  /**
   * Parent calls this to register/unregister a handler that receives every
   * raw sample at full 50 Hz — completely decoupled from display throttling.
   */
  onRegisterSampleHandler: (fn: ((data: number[]) => void) | null) => void;
  /** Whether a BLE device is currently connected. */
  isConnected: boolean;
  /** Current calibration straight (baseline) values. */
  baselines: number[];
  /** Current calibration bent (maxbend) values. */
  maxbends: number[];
  /** True once both steps have been completed at least once. */
  isCalibrated: boolean;
  /** Called when both capture steps are done. */
  onCalibrate: (baselines: number[], maxbends: number[]) => void;
  /** Called when user wants to redo calibration. */
  onReset: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CalibrationManager({
  onRegisterSampleHandler,
  isConnected,
  baselines,
  maxbends,
  isCalibrated,
  onCalibrate,
  onReset,
}: CalibrationManagerProps) {
  const { colors } = useTheme();

  const [step, setStep]         = useState<CaptureStep>('idle');
  const [progress, setProgress] = useState(0);

  // Keep stable refs to avoid stale closures inside the registered handler
  const onCalibrateRef        = useRef(onCalibrate);
  const capturedBaselinesRef  = useRef<number[] | null>(null);
  const captureBufferRef      = useRef<number[][]>([]);
  const stepRef               = useRef<CaptureStep>('idle');

  useEffect(() => { onCalibrateRef.current = onCalibrate; }, [onCalibrate]);
  // Keep stepRef in sync so the callback (which captures stepRef, not step) stays accurate
  useEffect(() => { stepRef.current = step; }, [step]);

  // ── Register / unregister sample handler during active capture ────────────
  useEffect(() => {
    if (step !== 'straight' && step !== 'bent') {
      onRegisterSampleHandler(null);
      return;
    }

    onRegisterSampleHandler((sample: number[]) => {
      if (sample.length !== 5) return;
      captureBufferRef.current.push(sample);
      const count = captureBufferRef.current.length;
      setProgress(count);

      if (count >= CAPTURE_SAMPLES) {
        const avg = Array.from({ length: 5 }, (_, i) =>
          Math.round(
            captureBufferRef.current.reduce((sum, s) => sum + s[i], 0) / CAPTURE_SAMPLES,
          ),
        );

        captureBufferRef.current = [];
        setProgress(0);

        if (stepRef.current === 'straight') {
          capturedBaselinesRef.current = avg;
          setStep('bent');
        } else {
          onCalibrateRef.current(capturedBaselinesRef.current!, avg);
          capturedBaselinesRef.current = null;
          setStep('done');
        }
      }
    });

    return () => onRegisterSampleHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, onRegisterSampleHandler]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const startCapture = useCallback((captureStep: 'straight' | 'bent') => {
    captureBufferRef.current = [];
    setProgress(0);
    setStep(captureStep);
  }, []);

  const handleReset = useCallback(() => {
    captureBufferRef.current      = [];
    capturedBaselinesRef.current  = null;
    setProgress(0);
    setStep('idle');
    onReset();
  }, [onReset]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const progressPct  = Math.round((progress / CAPTURE_SAMPLES) * 100);
  const isCapturing  = step === 'straight' || step === 'bent';
  const step1Done    = step === 'bent' || step === 'done' || isCalibrated;
  const step2Done    = step === 'done' || isCalibrated;

  if (!isConnected) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Glove Calibration</Text>
        <View style={[
          styles.badge,
          { backgroundColor: isCalibrated ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)' },
        ]}>
          <View style={[styles.badgeDot, { backgroundColor: isCalibrated ? '#34d399' : '#fbbf24' }]} />
          <Text style={[styles.badgeText, { color: isCalibrated ? '#34d399' : '#fbbf24' }]}>
            {isCalibrated ? 'Calibrated' : 'Not calibrated'}
          </Text>
        </View>
      </View>

      {/* Intro hint */}
      {!isCalibrated && step === 'idle' && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Calibrate once per session so the app knows your hand's range of motion.
          Keep each position steady while capturing.
        </Text>
      )}

      {/* ── Step 1: Straight ─────────────────────────────────────────────── */}
      <View style={styles.stepRow}>
        <View style={styles.stepLeft}>
          <View style={[styles.stepNum, {
            backgroundColor: step1Done ? '#34d399' : colors.accentPrimary,
          }]}>
            <Text style={styles.stepNumText}>{step1Done ? '✓' : '1'}</Text>
          </View>
          <View>
            <Text style={[styles.stepLabel, { color: colors.textPrimary }]}>Hold hand fully straight</Text>
            {step1Done && (
              <Text style={[styles.capturedNote, { color: '#34d399' }]}>
                {capturedBaselinesRef.current
                  ? capturedBaselinesRef.current.join(', ')
                  : baselines.join(', ')}
              </Text>
            )}
          </View>
        </View>

        {!isCalibrated && !step1Done && (
          step !== 'straight' ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.accentPrimary }]}
              onPress={() => startCapture('straight')}
              disabled={isCapturing}
            >
              <Text style={[styles.btnText, { color: colors.accentText }]}>Capture</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.progressWrap}>
              <View style={[styles.progressTrack, { backgroundColor: colors.bgSecondary }]}>
                <View style={[styles.progressFill, {
                  width: `${progressPct}%`,
                  backgroundColor: colors.accentPrimary,
                }]} />
              </View>
              <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>{progressPct}%</Text>
            </View>
          )
        )}
      </View>

      {/* ── Step 2: Bent ─────────────────────────────────────────────────── */}
      <View style={styles.stepRow}>
        <View style={styles.stepLeft}>
          <View style={[styles.stepNum, {
            backgroundColor: step2Done
              ? '#34d399'
              : step === 'bent' ? colors.accentPrimary
              : colors.bgSecondary,
          }]}>
            <Text style={[styles.stepNumText, {
              color: (step2Done || step === 'bent') ? '#fff' : colors.textSecondary,
            }]}>
              {step2Done ? '✓' : '2'}
            </Text>
          </View>
          <View>
            <Text style={[styles.stepLabel, { color: step1Done ? colors.textPrimary : colors.textSecondary }]}>
              Make a fist (all fingers bent)
            </Text>
            {step2Done && (
              <Text style={[styles.capturedNote, { color: '#34d399' }]}>
                {maxbends.join(', ')}
              </Text>
            )}
          </View>
        </View>

        {step === 'bent' && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: colors.bgSecondary }]}>
              <View style={[styles.progressFill, {
                width: `${progressPct}%`,
                backgroundColor: '#34d399',
              }]} />
            </View>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>{progressPct}%</Text>
          </View>
        )}
      </View>

      {/* ── Calibrated summary ────────────────────────────────────────────── */}
      {isCalibrated && (
        <View style={[styles.summary, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={styles.summaryHeaderRow}>
            <Text style={[styles.summaryHeader, { color: colors.textSecondary }]}>Finger</Text>
            <Text style={[styles.summaryHeader, { color: colors.textSecondary }]}>Straight</Text>
            <Text style={[styles.summaryHeader, { color: colors.textSecondary }]}>Bent</Text>
          </View>
          {FINGER_NAMES.map((name, i) => (
            <View key={name} style={styles.summaryRow}>
              <Text style={[styles.summaryCell, { color: colors.textSecondary }]}>{name}</Text>
              <Text style={[styles.summaryCell, { color: '#34d399', fontWeight: '600' }]}>
                {baselines[i]}
              </Text>
              <Text style={[styles.summaryCell, { color: '#fb923c', fontWeight: '600' }]}>
                {maxbends[i]}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Recalibrate */}
      {isCalibrated && (
        <TouchableOpacity
          style={[styles.resetBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}
          onPress={handleReset}
        >
          <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>Recalibrate</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16, gap: 10,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  title:        { fontSize: 15, fontWeight: '600' },
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeDot:     { width: 6, height: 6, borderRadius: 3 },
  badgeText:    { fontSize: 11, fontWeight: '700' },
  hint:         { fontSize: 12, lineHeight: 18 },
  stepRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stepLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  stepNum:      { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNumText:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepLabel:    { fontSize: 13, fontWeight: '500' },
  capturedNote: { fontSize: 10, marginTop: 2 },
  btn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText:      { fontSize: 13, fontWeight: '600' },
  progressWrap: { width: 90, gap: 3 },
  progressTrack:{ height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel:{ fontSize: 10, textAlign: 'right' },
  summary:      { borderRadius: 8, borderWidth: 1, padding: 10, gap: 4 },
  summaryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryHeader:{ fontSize: 10, fontWeight: '600', flex: 1 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCell:  { fontSize: 12, flex: 1 },
  resetBtn:     { padding: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  resetBtnText: { fontSize: 13 },
});
