import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { DEFAULT_BASELINES, DEFAULT_MAXBENDS } from '../utils/normalization';

// ── Constants ────────────────────────────────────────────────────────────────
const CAPTURE_SAMPLES = 100; // 2 seconds at 50 Hz
const FINGER_NAMES    = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

// ── Types ────────────────────────────────────────────────────────────────────
type CaptureStep = 'idle' | 'straight' | 'bent';
type Mode        = 'per-finger' | 'full-hand';

interface FingerCalib {
  straightSamples: number[];
  bentSamples:     number[];
  baseline:        number | null;
  maxbend:         number | null;
}

interface CalibrationManagerProps {
  onRegisterSampleHandler: (fn: ((data: number[]) => void) | null) => void;
  isConnected:   boolean;
  baselines:     number[];
  maxbends:      number[];
  isCalibrated:  boolean;
  onCalibrate:   (baselines: number[], maxbends: number[]) => void;
  onReset:       () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const emptyFinger = (): FingerCalib => ({
  straightSamples: [], bentSamples: [], baseline: null, maxbend: null,
});
const emptyAll = (): FingerCalib[] => Array(5).fill(null).map(emptyFinger);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeCalib(fc: FingerCalib): { baseline: number; maxbend: number } {
  const s = median(fc.straightSamples);
  const b = median(fc.bentSamples);
  const hi = Math.max(s, b);
  const lo = Math.min(s, b);
  const range = hi - lo;
  return {
    baseline: Math.round(hi + range * 0.05),
    maxbend:  Math.round(lo - range * 0.05),
  };
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

  const [mode,          setMode]          = useState<Mode>('per-finger');
  const [step,          setStep]          = useState<CaptureStep>('idle');
  const [activeFinger,  setActiveFinger]  = useState(0);
  const [fingerData,    setFingerData]    = useState<FingerCalib[]>(emptyAll());
  const [progress,      setProgress]      = useState(0);

  // Stable refs to avoid stale closures in the registered handler
  const onCalibrateRef   = useRef(onCalibrate);
  const stepRef          = useRef<CaptureStep>('idle');
  const modeRef          = useRef<Mode>('per-finger');
  const activeFingerRef  = useRef(0);
  const fingerDataRef    = useRef<FingerCalib[]>(emptyAll());

  useEffect(() => { onCalibrateRef.current  = onCalibrate;   }, [onCalibrate]);
  useEffect(() => { stepRef.current         = step;          }, [step]);
  useEffect(() => { modeRef.current         = mode;          }, [mode]);
  useEffect(() => { activeFingerRef.current = activeFinger;  }, [activeFinger]);
  useEffect(() => { fingerDataRef.current   = fingerData;    }, [fingerData]);

  // ── Register / unregister sample handler ─────────────────────────────────
  useEffect(() => {
    if (step === 'idle') { onRegisterSampleHandler(null); return; }

    onRegisterSampleHandler((sample: number[]) => {
      if (sample.length < 5) return;

      const currentStep   = stepRef.current;
      const currentMode   = modeRef.current;
      const finger        = activeFingerRef.current;

      if (currentMode === 'full-hand') {
        // Collect samples for all 5 channels in parallel
        setFingerData(prev => {
          const next = prev.map((fc, i) => {
            const arr = currentStep === 'straight'
              ? [...fc.straightSamples, sample[i]]
              : [...fc.bentSamples,     sample[i]];
            return currentStep === 'straight'
              ? { ...fc, straightSamples: arr }
              : { ...fc, bentSamples:     arr };
          });

          const count = currentStep === 'straight'
            ? next[0].straightSamples.length
            : next[0].bentSamples.length;
          setProgress(count);

          if (count >= CAPTURE_SAMPLES) {
            setStep('idle');
            setProgress(0);
            if (currentStep === 'bent') {
              // Both steps done — compute and finalise
              const calibrated = next.map(fc => ({ ...fc, ...computeCalib(fc) }));
              // Fire apply immediately so results persist
              const newBaselines = calibrated.map(fc => fc.baseline!);
              const newMaxbends  = calibrated.map(fc => fc.maxbend!);
              setTimeout(() => onCalibrateRef.current(newBaselines, newMaxbends), 0);
              return calibrated;
            }
          }
          return next;
        });

      } else {
        // Per-finger: only collect for the active channel
        setFingerData(prev => {
          const next = [...prev];
          const fc   = next[finger];
          const arr  = currentStep === 'straight'
            ? [...fc.straightSamples, sample[finger]]
            : [...fc.bentSamples,     sample[finger]];

          next[finger] = currentStep === 'straight'
            ? { ...fc, straightSamples: arr }
            : { ...fc, bentSamples:     arr };

          const count = arr.length;
          setProgress(count);

          if (count >= CAPTURE_SAMPLES) {
            setStep('idle');
            setProgress(0);
            if (currentStep === 'bent') {
              const result = computeCalib(next[finger]);
              next[finger] = { ...next[finger], ...result };
            }
          }
          return next;
        });
      }
    });

    return () => onRegisterSampleHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, onRegisterSampleHandler]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const startCapture = useCallback((s: 'straight' | 'bent') => {
    setProgress(0);
    setStep(s);
  }, []);

  const switchMode = useCallback((m: Mode) => {
    if (step !== 'idle') return;
    setMode(m);
    setFingerData(emptyAll());
    setActiveFinger(0);
    setProgress(0);
    onReset();
  }, [step, onReset]);

  const resetFinger = useCallback((i: number) => {
    setFingerData(prev => { const n = [...prev]; n[i] = emptyFinger(); return n; });
    setActiveFinger(i);
    setStep('idle');
    setProgress(0);
  }, []);

  const handleReset = useCallback(() => {
    setFingerData(emptyAll());
    setActiveFinger(0);
    setStep('idle');
    setProgress(0);
    onReset();
  }, [onReset]);

  const applyCalibration = useCallback(() => {
    const newBaselines = fingerData.map((fc, i) => fc.baseline ?? baselines[i]);
    const newMaxbends  = fingerData.map((fc, i) => fc.maxbend  ?? maxbends[i]);
    onCalibrate(newBaselines, newMaxbends);
  }, [fingerData, baselines, maxbends, onCalibrate]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isCapturing    = step !== 'idle';
  const progressPct    = Math.round((progress / CAPTURE_SAMPLES) * 100);
  const currentFD      = fingerData[activeFinger];
  const allCalibrated  = fingerData.every(fc => fc.baseline !== null);
  const anyCalibrated  = fingerData.some(fc => fc.baseline !== null);
  const calibCount     = fingerData.filter(fc => fc.baseline !== null).length;

  // What sample count to use for full-hand progress display
  const fhProgress = step === 'straight'
    ? fingerData[0].straightSamples.length
    : fingerData[0].bentSamples.length;

  // For per-finger: whether the two capture steps are done
  const pfHasStraight = currentFD.straightSamples.length >= CAPTURE_SAMPLES;
  const pfHasBent     = currentFD.bentSamples.length     >= CAPTURE_SAMPLES;
  // For full-hand
  const fhHasStraight = fingerData[0].straightSamples.length >= CAPTURE_SAMPLES;
  const fhHasBent     = fingerData[0].bentSamples.length     >= CAPTURE_SAMPLES;

  const hasStraight = mode === 'per-finger' ? pfHasStraight : fhHasStraight;
  const hasBent     = mode === 'per-finger' ? pfHasBent     : fhHasBent;

  if (!isConnected) return null;

  // ── Sub-components ────────────────────────────────────────────────────────
  const ProgressBar = ({ pct, color }: { pct: number; color: string }) => (
    <View style={styles.progressWrap}>
      <View style={[styles.progressTrack, { backgroundColor: colors.bgSecondary }]}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>{pct}%</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Sensor Calibrator</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {mode === 'per-finger' ? 'Calibrate each finger individually' : 'Calibrate all fingers at once'}
          </Text>
        </View>
        <View style={[styles.badge, {
          backgroundColor: isCalibrated ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
        }]}>
          <View style={[styles.badgeDot, { backgroundColor: isCalibrated ? '#34d399' : '#fbbf24' }]} />
          <Text style={[styles.badgeText, { color: isCalibrated ? '#34d399' : '#fbbf24' }]}>
            {isCalibrated ? 'Calibrated' : 'Not calibrated'}
          </Text>
        </View>
      </View>

      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <View style={[styles.modeTabs, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
        {(['per-finger', 'full-hand'] as Mode[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.modeTab, mode === m && { backgroundColor: colors.accentPrimary }]}
            onPress={() => switchMode(m)}
            disabled={isCapturing}
          >
            <Text style={[styles.modeTabTxt, {
              color: mode === m ? colors.accentText : colors.textSecondary,
              opacity: isCapturing && mode !== m ? 0.4 : 1,
            }]}>
              {m === 'per-finger' ? '☝️ Per-Finger' : '✋ Full Hand'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Per-Finger: finger selector tabs ────────────────────────────── */}
      {mode === 'per-finger' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fingerTabsScroll}>
          <View style={styles.fingerTabs}>
            {FINGER_NAMES.map((name, i) => {
              const fc           = fingerData[i];
              const done         = fc.baseline !== null;
              const isActive     = activeFinger === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.fingerTab,
                    { borderColor: isActive ? colors.accentPrimary : colors.borderColor },
                    done && { backgroundColor: 'rgba(52,211,153,0.1)', borderColor: '#34d399' },
                    isActive && !done && { backgroundColor: `${colors.accentPrimary}18` },
                  ]}
                  onPress={() => step === 'idle' && setActiveFinger(i)}
                  disabled={isCapturing}
                >
                  <Text style={[styles.fingerTabName, {
                    color: done ? '#34d399' : isActive ? colors.accentPrimary : colors.textSecondary,
                  }]}>
                    {name}
                  </Text>
                  {done && <Text style={styles.fingerTabCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── Calibration steps box ────────────────────────────────────────── */}
      <View style={[styles.stepsBox, { borderColor: colors.accentPrimary, backgroundColor: `${colors.bgSecondary}80` }]}>
        {/* Box header */}
        <View style={styles.stepsHeader}>
          <Text style={[styles.stepsTitle, { color: colors.textPrimary }]}>
            {mode === 'full-hand'
              ? 'Calibrating: All Fingers'
              : `Calibrating: ${FINGER_NAMES[activeFinger]}`}
          </Text>
          {mode === 'per-finger' && currentFD.baseline !== null && (
            <TouchableOpacity
              style={[styles.redoBtn, { borderColor: '#ef4444' }]}
              onPress={() => resetFinger(activeFinger)}
              disabled={isCapturing}
            >
              <Text style={[styles.redoBtnTxt, { color: '#ef4444' }]}>Redo</Text>
            </TouchableOpacity>
          )}
          {mode === 'full-hand' && allCalibrated && (
            <TouchableOpacity
              style={[styles.redoBtn, { borderColor: '#ef4444' }]}
              onPress={handleReset}
              disabled={isCapturing}
            >
              <Text style={[styles.redoBtnTxt, { color: '#ef4444' }]}>Reset All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Step 1: Straight */}
        <View style={[styles.stepCard, {
          backgroundColor: colors.bgCard,
          borderColor: step === 'straight' ? '#34d399' : colors.borderColor,
          borderWidth: step === 'straight' ? 2 : 1,
        }]}>
          <View style={styles.stepCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepCardTitle, { color: colors.textPrimary }]}>
                Step 1 — Straighten {mode === 'full-hand' ? 'All Fingers' : FINGER_NAMES[activeFinger]}
              </Text>
              <Text style={[styles.stepCardHint, { color: colors.textSecondary }]}>
                {mode === 'full-hand'
                  ? 'Hold hand flat, all fingers fully extended'
                  : `Keep ${FINGER_NAMES[activeFinger]} fully straight`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.captureBtn, {
                backgroundColor: hasStraight ? '#34d399' : colors.accentPrimary,
                opacity: (!isConnected || isCapturing || hasStraight) ? 0.6 : 1,
              }]}
              onPress={() => startCapture('straight')}
              disabled={!isConnected || isCapturing || hasStraight}
            >
              <Text style={styles.captureBtnTxt}>
                {hasStraight ? '✓' : 'Record'}
              </Text>
            </TouchableOpacity>
          </View>
          {step === 'straight' && (
            <ProgressBar
              pct={mode === 'full-hand'
                ? Math.round((fhProgress / CAPTURE_SAMPLES) * 100)
                : progressPct}
              color={colors.accentPrimary}
            />
          )}
        </View>

        {/* Step 2: Bent */}
        <View style={[styles.stepCard, {
          backgroundColor: colors.bgCard,
          borderColor: step === 'bent' ? '#34d399' : colors.borderColor,
          borderWidth: step === 'bent' ? 2 : 1,
          opacity: hasStraight ? 1 : 0.5,
        }]}>
          <View style={styles.stepCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepCardTitle, { color: colors.textPrimary }]}>
                Step 2 — Bend {mode === 'full-hand' ? 'All Fingers' : FINGER_NAMES[activeFinger]}
              </Text>
              <Text style={[styles.stepCardHint, { color: colors.textSecondary }]}>
                {mode === 'full-hand'
                  ? 'Make a fist, all fingers fully curled'
                  : `Curl ${FINGER_NAMES[activeFinger]} fully bent`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.captureBtn, {
                backgroundColor: hasBent ? '#34d399' : colors.accentPrimary,
                opacity: (!isConnected || !hasStraight || isCapturing || hasBent) ? 0.6 : 1,
              }]}
              onPress={() => startCapture('bent')}
              disabled={!isConnected || !hasStraight || isCapturing || hasBent}
            >
              <Text style={styles.captureBtnTxt}>
                {hasBent ? '✓' : 'Record'}
              </Text>
            </TouchableOpacity>
          </View>
          {step === 'bent' && (
            <ProgressBar
              pct={mode === 'full-hand'
                ? Math.round((fhProgress / CAPTURE_SAMPLES) * 100)
                : progressPct}
              color="#34d399"
            />
          )}
        </View>

        {/* Result preview for completed finger (per-finger) */}
        {mode === 'per-finger' && currentFD.baseline !== null && (
          <View style={[styles.resultBox, { backgroundColor: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.3)' }]}>
            <Text style={[styles.resultTitle, { color: '#34d399' }]}>
              {FINGER_NAMES[activeFinger]} calibrated ✓
            </Text>
            <Text style={[styles.resultValue, { color: colors.textSecondary }]}>
              Straight: {currentFD.baseline}  ·  Bent: {currentFD.maxbend}
            </Text>
          </View>
        )}

        {/* Result preview for full-hand */}
        {mode === 'full-hand' && allCalibrated && (
          <View style={[styles.resultBox, { backgroundColor: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.3)' }]}>
            <Text style={[styles.resultTitle, { color: '#34d399' }]}>All fingers calibrated ✓</Text>
            {fingerData.map((fc, i) => (
              <Text key={i} style={[styles.resultValue, { color: colors.textSecondary }]}>
                {FINGER_NAMES[i]}: {fc.baseline} → {fc.maxbend}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* ── Apply section ────────────────────────────────────────────────── */}
      {anyCalibrated && (
        <View style={[styles.applyBox, {
          backgroundColor: allCalibrated ? 'rgba(52,211,153,0.1)' : 'rgba(99,102,241,0.1)',
          borderColor:     allCalibrated ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.3)',
        }]}>
          <Text style={[styles.applyTitle, {
            color: allCalibrated ? '#34d399' : colors.accentPrimary,
          }]}>
            {allCalibrated
              ? 'All Fingers Calibrated'
              : `${calibCount}/5 Fingers Calibrated`}
          </Text>

          {!allCalibrated && (
            <Text style={[styles.applyHint, { color: colors.textSecondary }]}>
              You can apply now — uncalibrated fingers use defaults.
            </Text>
          )}

          {/* Per-finger summary */}
          {mode === 'per-finger' && (
            <View style={styles.applyTable}>
              {FINGER_NAMES.map((name, i) => {
                const fc   = fingerData[i];
                const done = fc.baseline !== null;
                return (
                  <View key={i} style={styles.applyRow}>
                    <Text style={[styles.applyRowName, { color: done ? colors.textPrimary : colors.textSecondary, opacity: done ? 1 : 0.6 }]}>
                      {name}
                    </Text>
                    <Text style={[styles.applyRowVal, { color: done ? '#34d399' : colors.textSecondary, opacity: done ? 1 : 0.6 }]}>
                      {done
                        ? `${fc.baseline} → ${fc.maxbend}`
                        : `${baselines[i]} → ${maxbends[i]} (default)`}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.applyBtnRow}>
            <TouchableOpacity
              style={[styles.applyBtn, {
                backgroundColor: allCalibrated ? '#34d399' : colors.accentPrimary,
                flex: 2,
              }]}
              onPress={applyCalibration}
            >
              <Text style={[styles.applyBtnTxt, { color: '#fff' }]}>
                {allCalibrated ? 'Apply All' : `Apply ${calibCount} Finger${calibCount > 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyBtn, {
                backgroundColor: colors.bgSecondary,
                borderWidth: 1,
                borderColor: colors.borderColor,
                flex: 1,
              }]}
              onPress={handleReset}
            >
              <Text style={[styles.applyBtnTxt, { color: colors.textPrimary }]}>Reset All</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Calibrated summary table ─────────────────────────────────────── */}
      {isCalibrated && !anyCalibrated && (
        <View style={[styles.summaryTable, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={styles.summaryHeaderRow}>
            <Text style={[styles.summaryHeader, { color: colors.textSecondary }]}>Finger</Text>
            <Text style={[styles.summaryHeader, { color: '#34d399' }]}>Straight</Text>
            <Text style={[styles.summaryHeader, { color: '#fb923c' }]}>Bent</Text>
          </View>
          {FINGER_NAMES.map((name, i) => (
            <View key={name} style={styles.summaryRow}>
              <Text style={[styles.summaryCell, { color: colors.textSecondary }]}>{name}</Text>
              <Text style={[styles.summaryCell, { color: '#34d399', fontWeight: '600' }]}>{baselines[i]}</Text>
              <Text style={[styles.summaryCell, { color: '#fb923c', fontWeight: '600' }]}>{maxbends[i]}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16, gap: 12 },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:            { fontSize: 15, fontWeight: '700' },
  subtitle:         { fontSize: 11, marginTop: 2 },
  badge:            { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeDot:         { width: 6, height: 6, borderRadius: 3 },
  badgeText:        { fontSize: 10, fontWeight: '700' },

  modeTabs:         { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  modeTab:          { flex: 1, paddingVertical: 9, alignItems: 'center' },
  modeTabTxt:       { fontSize: 13, fontWeight: '600' },

  fingerTabsScroll: { marginHorizontal: -4 },
  fingerTabs:       { flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  fingerTab:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center', minWidth: 62 },
  fingerTabName:    { fontSize: 12, fontWeight: '600' },
  fingerTabCheck:   { fontSize: 10, color: '#34d399', marginTop: 2 },

  stepsBox:         { borderRadius: 10, borderWidth: 2, padding: 12, gap: 8 },
  stepsHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepsTitle:       { fontSize: 13, fontWeight: '700', flex: 1 },
  redoBtn:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  redoBtnTxt:       { fontSize: 11, fontWeight: '600' },

  stepCard:         { borderRadius: 8, padding: 10, gap: 6 },
  stepCardRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepCardTitle:    { fontSize: 12, fontWeight: '600' },
  stepCardHint:     { fontSize: 10, marginTop: 2 },
  captureBtn:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  captureBtnTxt:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  progressWrap:     { gap: 3 },
  progressTrack:    { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill:     { height: '100%', borderRadius: 3 },
  progressLabel:    { fontSize: 9, textAlign: 'right' },

  resultBox:        { borderRadius: 8, borderWidth: 1, padding: 10, gap: 3 },
  resultTitle:      { fontSize: 12, fontWeight: '700' },
  resultValue:      { fontSize: 10, fontFamily: 'monospace' },

  applyBox:         { borderRadius: 10, borderWidth: 1, padding: 12, gap: 10 },
  applyTitle:       { fontSize: 14, fontWeight: '700' },
  applyHint:        { fontSize: 11 },
  applyTable:       { gap: 4 },
  applyRow:         { flexDirection: 'row', gap: 8 },
  applyRowName:     { fontSize: 11, fontWeight: '600', width: 52 },
  applyRowVal:      { fontSize: 11, fontFamily: 'monospace', flex: 1 },
  applyBtnRow:      { flexDirection: 'row', gap: 8 },
  applyBtn:         { padding: 12, borderRadius: 8, alignItems: 'center' },
  applyBtnTxt:      { fontSize: 14, fontWeight: '600' },

  summaryTable:     { borderRadius: 8, borderWidth: 1, padding: 10, gap: 4 },
  summaryHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  summaryHeader:    { fontSize: 10, fontWeight: '600', flex: 1 },
  summaryRow:       { flexDirection: 'row' },
  summaryCell:      { fontSize: 12, flex: 1 },
});
