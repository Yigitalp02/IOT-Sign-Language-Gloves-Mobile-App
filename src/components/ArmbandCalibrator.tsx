import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ArmQuat { w: number; x: number; y: number; z: number; }
export interface ArmPose  { q1: ArmQuat; q2: ArmQuat; }
export interface ArmbandCalibration {
  neutral: ArmPose | null; // Step 1 — arm hanging straight down
  forward: ArmPose | null; // Step 2 — arm pointing straight forward
  tpose:   ArmPose | null; // Step 3 — arm horizontal to the side (T-pose)
}

export const EMPTY_ARMBAND_CAL: ArmbandCalibration = { neutral: null, forward: null, tpose: null };

interface ArmbandCalibratorProps {
  currentArmImu: { q1: ArmQuat; q2: ArmQuat } | null;
  onCalibrationComplete: (cal: ArmbandCalibration) => void;
}

const STEPS = ['neutral', 'forward', 'tpose'] as const;
type StepKey = typeof STEPS[number];

const STEP_META: Record<StepKey, { color: string; title: string; desc: string }> = {
  neutral: { color: '#6366f1', title: 'Arm Down (Neutral)',   desc: 'Let your arm hang straight down at your side.' },
  forward: { color: '#3b82f6', title: 'Arm Forward',          desc: 'Point your arm straight ahead, parallel to the floor.' },
  tpose:   { color: '#10b981', title: 'T-Pose (Side)',        desc: 'Raise your arm straight out to the side, parallel to the floor.' },
};

function fmtQ(q: ArmQuat): string {
  return `w:${q.w.toFixed(3)} x:${q.x.toFixed(3)} y:${q.y.toFixed(3)} z:${q.z.toFixed(3)}`;
}

export default function ArmbandCalibrator({
  currentArmImu,
  onCalibrationComplete,
}: ArmbandCalibratorProps) {
  const { colors } = useTheme();

  const [cal, setCal]               = useState<ArmbandCalibration>(EMPTY_ARMBAND_CAL);
  const [activeStep, setActiveStep] = useState<StepKey | null>(null);
  const [justCaptured, setJustCaptured] = useState<StepKey | null>(null);
  const [expanded, setExpanded]     = useState(false);

  const isArmbandConnected = currentArmImu !== null && (
    currentArmImu.q1.w !== 1.0 || currentArmImu.q1.x !== 0.0 ||
    currentArmImu.q1.y !== 0.0 || currentArmImu.q1.z !== 0.0
  );

  const capture = useCallback((step: StepKey) => {
    if (!currentArmImu) return;
    const pose: ArmPose = {
      q1: { ...currentArmImu.q1 },
      q2: { ...currentArmImu.q2 },
    };
    setCal(prev => {
      const updated = { ...prev, [step]: pose };
      return updated;
    });
    setActiveStep(null);
    setJustCaptured(step);
    setTimeout(() => setJustCaptured(null), 2000);
  }, [currentArmImu]);

  const applyCalibration = useCallback(() => {
    onCalibrationComplete(cal);
  }, [cal, onCalibrationComplete]);

  const resetAll = useCallback(() => {
    setCal(EMPTY_ARMBAND_CAL);
    setActiveStep(null);
    onCalibrationComplete(EMPTY_ARMBAND_CAL);
  }, [onCalibrationComplete]);

  const anyCaptured = STEPS.some(s => cal[s] !== null);
  const allCaptured = STEPS.every(s => cal[s] !== null);
  const capturedCount = STEPS.filter(s => cal[s] !== null).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>

      {/* Header row */}
      <TouchableOpacity style={styles.headerRow} onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Armband Calibration</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {anyCaptured
              ? allCaptured
                ? '3/3 poses captured — tap Apply to activate'
                : `${capturedCount}/3 poses captured`
              : 'Capture 3 arm poses to enable FK position tracking'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {anyCaptured && (
            <View style={[styles.badge, { backgroundColor: allCaptured ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)' }]}>
              <Text style={[styles.badgeTxt, { color: allCaptured ? '#10b981' : '#818cf8' }]}>
                {capturedCount}/3
              </Text>
            </View>
          )}
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>{expanded ? '▼' : '▶'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          {/* Not connected warning */}
          {!isArmbandConnected && (
            <View style={[styles.banner, { backgroundColor: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.4)' }]}>
              <Text style={[styles.bannerTxt, { color: '#d97706' }]}>
                Armbands not detected. Connect the glove with armbands (23-column data) first.
              </Text>
            </View>
          )}

          {/* 3 pose steps */}
          {STEPS.map((step, idx) => {
            const meta   = STEP_META[step];
            const pose   = cal[step];
            const done   = pose !== null;
            const active = activeStep === step;
            const flashed = justCaptured === step;

            return (
              <View
                key={step}
                style={[
                  styles.stepCard,
                  {
                    borderColor: active ? meta.color : done ? meta.color + '66' : colors.borderColor,
                    borderWidth: active ? 2 : 1,
                    backgroundColor: active
                      ? meta.color + '18'
                      : done
                      ? meta.color + '10'
                      : colors.bgSecondary,
                  },
                ]}
              >
                <View style={styles.stepRow}>
                  {/* Circle badge */}
                  <View style={[styles.stepCircle, { backgroundColor: done ? meta.color : colors.borderColor }]}>
                    <Text style={styles.stepCircleTxt}>{done ? '✓' : String(idx + 1)}</Text>
                  </View>

                  {/* Text */}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
                      Step {idx + 1}: {meta.title}
                    </Text>
                    <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{meta.desc}</Text>
                    {done && pose && (
                      <Text style={[styles.quatTxt, { color: colors.textSecondary }]}>
                        Q1 {fmtQ(pose.q1)}{'\n'}Q2 {fmtQ(pose.q2)}
                      </Text>
                    )}
                  </View>

                  {/* Capture / Redo button */}
                  {!active ? (
                    <TouchableOpacity
                      style={[
                        styles.captureBtn,
                        {
                          backgroundColor: done ? meta.color + '22' : meta.color,
                          borderWidth: done ? 1 : 0,
                          borderColor: done ? meta.color + '66' : 'transparent',
                          opacity: isArmbandConnected ? 1 : 0.4,
                        },
                      ]}
                      onPress={() => setActiveStep(step)}
                      disabled={!isArmbandConnected}
                    >
                      <Text style={[styles.captureBtnTxt, { color: done ? meta.color : '#fff' }]}>
                        {flashed ? '✓ Saved' : done ? 'Redo' : 'Set Pose'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.activeButtons}>
                      <TouchableOpacity
                        style={[styles.captureBtn, { backgroundColor: meta.color }]}
                        onPress={() => capture(step)}
                      >
                        <Text style={[styles.captureBtnTxt, { color: '#fff' }]}>Capture</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.captureBtn, { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderColor }]}
                        onPress={() => setActiveStep(null)}
                      >
                        <Text style={[styles.captureBtnTxt, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Active instruction */}
                {active && (
                  <View style={[styles.activeBanner, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
                    <Text style={[styles.activeBannerTxt, { color: colors.textPrimary }]}>
                      👉 {meta.desc} Hold still, then tap Capture.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          {/* Apply / Reset row */}
          {anyCaptured && (
            <View style={[styles.applyBox, {
              backgroundColor: allCaptured ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.08)',
              borderColor:     allCaptured ? 'rgba(16,185,129,0.3)'  : 'rgba(99,102,241,0.3)',
            }]}>
              <Text style={[styles.applyTitle, { color: allCaptured ? '#10b981' : '#818cf8' }]}>
                {allCaptured
                  ? 'All 3 poses captured — apply to activate FK tracking'
                  : `${capturedCount}/3 poses captured — you can apply with just neutral + forward`}
              </Text>
              <View style={styles.applyBtnRow}>
                <TouchableOpacity
                  style={[styles.applyBtn, {
                    backgroundColor: allCaptured ? '#10b981' : '#6366f1',
                    flex: 2,
                    opacity: cal.neutral ? 1 : 0.4,
                  }]}
                  onPress={applyCalibration}
                  disabled={!cal.neutral}
                >
                  <Text style={[styles.applyBtnTxt, { color: '#fff' }]}>Apply Calibration</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.applyBtn, {
                    flex: 1,
                    backgroundColor: colors.bgSecondary,
                    borderWidth: 1,
                    borderColor: '#ef4444',
                  }]}
                  onPress={resetAll}
                >
                  <Text style={[styles.applyBtnTxt, { color: '#ef4444' }]}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16, gap: 10 },
  headerRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:          { fontSize: 15, fontWeight: '700' },
  subtitle:       { fontSize: 11, marginTop: 2 },
  badge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeTxt:       { fontSize: 11, fontWeight: '700' },
  chevron:        { fontSize: 12 },
  banner:         { padding: 10, borderRadius: 8, borderWidth: 1 },
  bannerTxt:      { fontSize: 11 },
  stepCard:       { borderRadius: 10, padding: 10, gap: 6 },
  stepRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepCircle:     { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  stepCircleTxt:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepTitle:      { fontSize: 12, fontWeight: '700' },
  stepDesc:       { fontSize: 10, marginTop: 2 },
  quatTxt:        { fontSize: 9, fontFamily: 'monospace', marginTop: 4, lineHeight: 14 },
  captureBtn:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, alignItems: 'center', minWidth: 72 },
  captureBtnTxt:  { fontSize: 11, fontWeight: '700' },
  activeButtons:  { gap: 4 },
  activeBanner:   { borderRadius: 6, borderWidth: 1, padding: 8 },
  activeBannerTxt:{ fontSize: 11 },
  applyBox:       { borderRadius: 10, borderWidth: 1, padding: 12, gap: 10 },
  applyTitle:     { fontSize: 12, fontWeight: '600' },
  applyBtnRow:    { flexDirection: 'row', gap: 8 },
  applyBtn:       { padding: 12, borderRadius: 8, alignItems: 'center' },
  applyBtnTxt:    { fontSize: 13, fontWeight: '700' },
});
