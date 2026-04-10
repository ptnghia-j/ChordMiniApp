import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function mix(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp01(amount);
}

export function easeInOutSineCurve(value: number): number {
  const clamped = clamp01(value);
  return 0.5 - 0.5 * Math.cos(Math.PI * clamped);
}

export function resolveQuietness(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) return 0.28;
  return signalDynamics.quietness ?? (signalDynamics.intensityBand === 'quiet' ? 1 : 0);
}

export function resolveFullness(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) return 0.45;
  return signalDynamics.fullness ?? (signalDynamics.intensityBand === 'loud' ? 1 : signalDynamics.intensityBand === 'medium' ? 0.5 : 0);
}

export function resolveMotion(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) return 0.4;
  return signalDynamics.motion ?? clamp01(signalDynamics.spectralFlux * 0.6 + signalDynamics.onsetStrength * 0.4);
}

export function resolveAttack(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) return 0.32;
  return signalDynamics.attack ?? clamp01(signalDynamics.onsetStrength);
}
