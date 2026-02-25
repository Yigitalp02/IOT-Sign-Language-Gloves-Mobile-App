/**
 * Thermistor normalization utilities.
 *
 * The physical glove outputs raw ADC values where:
 *   - Higher values = finger straight (less resistance)
 *   - Lower values  = finger bent    (more resistance)
 *
 * Normalized output: 0 = fully bent, 1 = fully straight.
 * This matches the training data format expected by the ML model.
 */

/** Default resting (straight) values — calibrated once for our glove. */
export const DEFAULT_BASELINES = [2700, 1650, 1850, 2110, 2125]; // thumb → pinky

/** Default fully-bent values. */
export const DEFAULT_MAXBENDS  = [2200, 1300, 1480, 1640, 1720]; // thumb → pinky

/**
 * Detect whether a sample contains raw thermistor readings (>2) or is
 * already normalized (all values between 0 and 1).
 */
export function isRawThermistorData(sample: number[]): boolean {
  return sample.some(v => v > 2);
}

/**
 * Normalize a single 5-channel sample from raw ADC values to [0, 1].
 *
 * Convention matches the ML model's training data:
 *   0 = finger fully straight (at baseline)
 *   1 = finger fully bent    (at maxbend)
 *
 * Formula per channel:
 *   normalized = clamp((baseline - raw) / (baseline - maxbend), 0, 1)
 *
 * This matches the desktop app:
 *   normalized = (thermBaseline - value) / (thermBaseline - thermMaxBend)
 */
export function normalizeSample(
  raw:       number[],
  baselines: number[] = DEFAULT_BASELINES,
  maxbends:  number[] = DEFAULT_MAXBENDS,
): number[] {
  return raw.map((value, i) => {
    const base  = baselines[i];
    const bent  = maxbends[i];
    const range = base - bent;                    // positive: baseline > maxbend
    if (Math.abs(range) < 1) return 0;            // degenerate — avoid divide-by-zero
    const n = (base - value) / range;             // 0 = straight, 1 = bent
    return Math.max(0, Math.min(1, n));
  });
}
