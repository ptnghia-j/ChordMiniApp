import type { InstrumentName } from '@/utils/instrumentNoteGeneration';

export interface InstrumentEnvelopeConfig {
  decayTime: number;
  releaseLeadTime: number;
  sustainTailSeconds: number;
  naturalFinishWindow: number;
  loadLoopData: boolean;
  crossfadeOverlapSeconds: number;
  switchAttackFloor: number;
  switchAttackRampWindow: number;
}

const DEFAULT_ENVELOPE: InstrumentEnvelopeConfig = {
  decayTime: 0.45,
  releaseLeadTime: 0.02,
  sustainTailSeconds: 0.04,
  naturalFinishWindow: 0.22,
  loadLoopData: false,
  crossfadeOverlapSeconds: 0.05,
  switchAttackFloor: 0.76,
  switchAttackRampWindow: 0.16,
};

const ENVELOPE_BY_INSTRUMENT: Record<InstrumentName, InstrumentEnvelopeConfig> = {
  piano: {
    decayTime: 0.52,
    releaseLeadTime: 0.025,
    sustainTailSeconds: 0.04,
    naturalFinishWindow: 0.26,
    loadLoopData: false,
    crossfadeOverlapSeconds: 0.06,
    switchAttackFloor: 0.7,
    switchAttackRampWindow: 0.16,
  },
  guitar: {
    decayTime: 0.34,
    releaseLeadTime: 0.02,
    sustainTailSeconds: 0.03,
    naturalFinishWindow: 0.2,
    loadLoopData: false,
    crossfadeOverlapSeconds: 0.05,
    switchAttackFloor: 0.74,
    switchAttackRampWindow: 0.13,
  },
  violin: {
    decayTime: 0.72,
    releaseLeadTime: 0.045,
    sustainTailSeconds: 0.06,
    naturalFinishWindow: 0.42,
    loadLoopData: true,
    crossfadeOverlapSeconds: 0.08,
    switchAttackFloor: 0.82,
    switchAttackRampWindow: 0.18,
  },
  flute: {
    decayTime: 0.66,
    releaseLeadTime: 0.04,
    sustainTailSeconds: 0.05,
    naturalFinishWindow: 0.36,
    loadLoopData: true,
    crossfadeOverlapSeconds: 0.075,
    switchAttackFloor: 0.8,
    switchAttackRampWindow: 0.17,
  },
  saxophone: {
    decayTime: 0.62,
    releaseLeadTime: 0.04,
    sustainTailSeconds: 0.05,
    naturalFinishWindow: 0.34,
    loadLoopData: true,
    crossfadeOverlapSeconds: 0.075,
    switchAttackFloor: 0.8,
    switchAttackRampWindow: 0.17,
  },
  bass: {
    decayTime: 0.28,
    releaseLeadTime: 0.018,
    sustainTailSeconds: 0.025,
    naturalFinishWindow: 0.18,
    loadLoopData: false,
    crossfadeOverlapSeconds: 0.04,
    switchAttackFloor: 0.78,
    switchAttackRampWindow: 0.11,
  },
};

export function getInstrumentEnvelopeProfile(instrumentName: InstrumentName): InstrumentEnvelopeConfig {
  return ENVELOPE_BY_INSTRUMENT[instrumentName] ?? DEFAULT_ENVELOPE;
}

export function getInstrumentVisualSustainTailSeconds(instrumentName: InstrumentName): number {
  const envelope = getInstrumentEnvelopeProfile(instrumentName);
  return envelope.sustainTailSeconds + Math.min(envelope.naturalFinishWindow, envelope.decayTime * 0.45);
}
