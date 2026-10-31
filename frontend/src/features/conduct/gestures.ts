export const SIGNS = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'] as const;
export type Sign = typeof SIGNS[number];
export type Point = { x: number; y: number; z: number };
export type Samples = Partial<Record<Sign, number[][]>>;
export const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'] as const;
export type ConductNote = typeof NOTES[number];
export type Recognition = { sign: Sign | 'Do′'; note: ConductNote; distance: number };

/** Translation/scale normalization preserves wrist orientation (musically meaningful). */
export function handFeatures(points: readonly Point[]): number[] | null {
  if (points.length !== 21 || points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return null;
  const wrist = points[0];
  const scale = Math.hypot(points[9].x - wrist.x, points[9].y - wrist.y);
  if (scale < 0.02) return null;
  return points.flatMap(p => [(p.x - wrist.x) / scale, (p.y - wrist.y) / scale, (p.z - wrist.z) / scale]);
}

export function calibrationReady(samples: Samples, lowY: number | null, highY: number | null): boolean {
  return SIGNS.every(sign => (samples[sign]?.length ?? 0) >= 3)
    && lowY !== null && highY !== null && Number.isFinite(lowY) && Number.isFinite(highY)
    && lowY - highY >= 0.15;
}

/** Personal template prototype, not a pretrained or accuracy-certified sign model. */
export function recognize(points: readonly Point[], samples: Samples, lowY: number | null, highY: number | null): Recognition | null {
  const features = handFeatures(points);
  if (!features || !calibrationReady(samples, lowY, highY)) return null;
  const ranked = SIGNS.map(sign => {
    const distances = (samples[sign] ?? []).map(sample => sample.length === features.length
      ? Math.sqrt(sample.reduce((sum, value, i) => sum + (value - features[i]) ** 2, 0) / features.length)
      : Infinity).sort((a, b) => a - b);
    return { sign, distance: distances.slice(0, 3).reduce((a, b) => a + b, 0) / 3 };
  }).sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  // Conservative prototype thresholds: ambiguous and unfamiliar poses remain silent.
  if (!Number.isFinite(best.distance) || best.distance > 0.22 || ranked[1].distance - best.distance < 0.045) return null;
  if (best.sign === 'Do') {
    const midpoint = (lowY! + highY!) / 2;
    if (Math.abs(points[0].y - midpoint) < 0.04) return null;
    return { ...best, sign: points[0].y < midpoint ? 'Do′' : 'Do', note: points[0].y < midpoint ? 'C5' : 'C4' };
  }
  return { ...best, note: NOTES[SIGNS.indexOf(best.sign)] };
}

/** One attack per stable sign; neutral release is required to repeat that sign. */
export class GestureGate {
  private candidate: ConductNote | null = null;
  private candidateSince = 0;
  private latched: ConductNote | null = null;
  private neutralSince: number | null = null;
  private lastTimestamp = -Infinity;

  update(note: ConductNote | null, timestamp: number): ConductNote | null {
    if (!Number.isFinite(timestamp) || timestamp <= this.lastTimestamp) return null;
    if (timestamp - this.lastTimestamp > 350) { this.candidate = null; this.latched = null; }
    this.lastTimestamp = timestamp;
    if (note === null) {
      this.candidate = null;
      this.neutralSince ??= timestamp;
      if (timestamp - this.neutralSince >= 250) this.latched = null;
      return null;
    }
    this.neutralSince = null;
    if (this.candidate !== note) { this.candidate = note; this.candidateSince = timestamp; return null; }
    if (timestamp - this.candidateSince < 180 || this.latched === note) return null;
    this.latched = note;
    return note;
  }
}
