import type { SheetSageResult } from '@/types/sheetSage';
import type { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import { audioContextManager } from '@/services/audio/audioContextManager';
import { midiToNoteName, type ChordEvent } from '@/utils/chordToMidi';
import type { ScheduledNote } from '@/utils/instrumentNoteGeneration';

export interface SheetSageVisualNote {
  midi: number;
  startTime: number;
  endTime: number;
  color: string;
  labelText?: string;
}

interface PreparedSheetSageMelodyNote {
  noteName: string;
  midi: number;
  onset: number;
  offset: number;
  velocityMultiplier: number;
  isBass: boolean;
}

const MELODIC_PLAYBACK_BASE_ADVANCE_SECONDS = 0.16;
const MELODIC_PLAYBACK_MAX_LATENCY_COMPENSATION_SECONDS = 0.05;
const MELODIC_NOTE_GAP_SECONDS = 0.012;
const MELODIC_DYNAMIC_SMOOTHING_QUICK = 0.74;
const MELODIC_DYNAMIC_SMOOTHING_MEDIUM = 0.62;
const MELODIC_DYNAMIC_SMOOTHING_WIDE = 0.5;
const MELODIC_MAX_DYNAMIC_STEP_QUICK = 0.06;
const MELODIC_MAX_DYNAMIC_STEP_MEDIUM = 0.09;
const MELODIC_MAX_DYNAMIC_STEP_WIDE = 0.12;
const MELODIC_AUDIO_CONTOUR_WEIGHT = 0.82;
const MELODIC_MODEL_VELOCITY_WEIGHT = 0.18;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampMidiPitch(midi: number): number {
  return Math.max(0, Math.min(127, Math.round(midi)));
}

function getMelodicPlaybackAdvanceSeconds(): number {
  if (typeof window === 'undefined') {
    return MELODIC_PLAYBACK_BASE_ADVANCE_SECONDS;
  }

  try {
    const audioContext = audioContextManager.getContext();
    const baseLatency = Number.isFinite(audioContext.baseLatency) ? audioContext.baseLatency : 0;
    const outputLatency = 'outputLatency' in audioContext && Number.isFinite(audioContext.outputLatency)
      ? audioContext.outputLatency
      : 0;
    const latencyCompensation = clamp(
      baseLatency + outputLatency,
      0,
      MELODIC_PLAYBACK_MAX_LATENCY_COMPENSATION_SECONDS,
    );

    return clamp(
      MELODIC_PLAYBACK_BASE_ADVANCE_SECONDS + latencyCompensation,
      0.14,
      0.24,
    );
  } catch {
    return MELODIC_PLAYBACK_BASE_ADVANCE_SECONDS;
  }
}

function stabilizeScheduledMelodyNotes(notes: ScheduledNote[]): ScheduledNote[] {
  if (notes.length <= 1) {
    return notes;
  }

  const stabilized = notes.map((note) => ({ ...note }));

  for (let index = 0; index < stabilized.length; index += 1) {
    const previousNote = index > 0 ? stabilized[index - 1] : null;
    const currentNote = stabilized[index];
    const nextNote = index < stabilized.length - 1 ? stabilized[index + 1] : null;

    if (!currentNote) {
      continue;
    }

    if (nextNote) {
      const nextStartOffset = nextNote.startOffset;
      const maximumDurationBeforeNext = nextStartOffset - currentNote.startOffset - MELODIC_NOTE_GAP_SECONDS;
      const minimumDuration = Math.min(currentNote.duration, 0.024);
      const trimmedDuration = Math.max(minimumDuration, maximumDurationBeforeNext);

      if (trimmedDuration > 0 && trimmedDuration < currentNote.duration) {
        currentNote.duration = trimmedDuration;
      }
    }

    const previousVelocity = previousNote?.velocityMultiplier ?? currentNote.velocityMultiplier;
    const nextVelocity = nextNote?.velocityMultiplier ?? currentNote.velocityMultiplier;
    const neighborhoodTarget = clamp(
      previousVelocity * 0.22
        + currentNote.velocityMultiplier * 0.56
        + nextVelocity * 0.22,
      0.28,
      1.02,
    );

    if (previousNote) {
      const onsetGap = Math.max(0, currentNote.startOffset - previousNote.startOffset);
      const smoothingAmount = onsetGap < 0.08
        ? MELODIC_DYNAMIC_SMOOTHING_QUICK
        : onsetGap < 0.18
          ? MELODIC_DYNAMIC_SMOOTHING_MEDIUM
          : MELODIC_DYNAMIC_SMOOTHING_WIDE;
      const maxStep = onsetGap < 0.08
        ? MELODIC_MAX_DYNAMIC_STEP_QUICK
        : onsetGap < 0.18
          ? MELODIC_MAX_DYNAMIC_STEP_MEDIUM
          : MELODIC_MAX_DYNAMIC_STEP_WIDE;
      const blendedTarget = clamp(
        previousNote.velocityMultiplier + (neighborhoodTarget - previousNote.velocityMultiplier) * smoothingAmount,
        0.28,
        1.02,
      );
      const constrainedDelta = clamp(
        blendedTarget - previousNote.velocityMultiplier,
        -maxStep,
        maxStep,
      );

      currentNote.velocityMultiplier = clamp(
        previousNote.velocityMultiplier + constrainedDelta,
        0.28,
        1.02,
      );
    } else {
      currentNote.velocityMultiplier = neighborhoodTarget;
    }
  }

  return stabilized;
}

function stabilizePreparedMelodyNotes(notes: PreparedSheetSageMelodyNote[]): PreparedSheetSageMelodyNote[] {
  if (notes.length <= 1) {
    return notes;
  }

  const scheduledLike: ScheduledNote[] = notes.map((note) => ({
    noteName: note.noteName,
    midi: note.midi,
    startOffset: note.onset,
    duration: note.offset - note.onset,
    velocityMultiplier: note.velocityMultiplier,
    isBass: note.isBass,
  }));

  const stabilized = stabilizeScheduledMelodyNotes(scheduledLike);

  return stabilized.map((note) => ({
    noteName: note.noteName,
    midi: note.midi,
    onset: note.startOffset,
    offset: note.startOffset + note.duration,
    velocityMultiplier: note.velocityMultiplier,
    isBass: note.isBass,
  }));
}

export function convertSheetSageToChordEvents(result: SheetSageResult | null): ChordEvent[] {
  if (!result?.noteEvents?.length) {
    return [];
  }

  return result.noteEvents.map((event, index) => {
    const fullNoteName = midiToNoteName(event.pitch);
    const noteMatch = fullNoteName.match(/^([A-G][#b]?)(-?\d+)$/);
    const noteName = noteMatch?.[1] || fullNoteName;
    const octave = noteMatch ? parseInt(noteMatch[2], 10) : Math.floor(event.pitch / 12) - 1;

    return {
      chordName: fullNoteName,
      notes: [
        {
          name: fullNoteName,
          noteName,
          octave,
          midi: event.pitch,
        },
      ],
      startTime: event.onset,
      endTime: event.offset,
      beatIndex: index,
      beatCount: 1,
    };
  });
}

export function buildScheduledSheetSagePianoNotes(
  result: SheetSageResult | null,
  currentTime: number,
): ScheduledNote[] {
  if (!result?.noteEvents?.length) {
    return [];
  }

  return result.noteEvents
    .filter((event) => event.offset > currentTime + 0.01)
    .map((event): ScheduledNote | null => {
      const noteName = midiToNoteName(event.pitch);
      const audibleStart = Math.max(event.onset, currentTime);
      const duration = event.offset - audibleStart;

      if (duration <= 0.01) {
        return null;
      }

      return {
        noteName,
        midi: event.pitch,
        startOffset: Math.max(0, event.onset - currentTime),
        duration,
        velocityMultiplier: clamp(event.velocity / 90, 0.18, 1.35),
        isBass: event.pitch < 40,
      } satisfies ScheduledNote;
    })
    .filter((note): note is ScheduledNote => note !== null);
}

export function buildPreparedSheetSageMelodyNotes(
  result: SheetSageResult | null,
  dynamicsAnalyzer?: DynamicsAnalyzer | null,
  pitchShiftSemitones: number = 0,
): PreparedSheetSageMelodyNote[] {
  if (!result?.noteEvents?.length) {
    return [];
  }

  const preparedNotes = result.noteEvents
    .slice()
    .sort((left, right) => left.onset - right.onset || left.pitch - right.pitch)
    .map((event) => {
      const transposedMidi = clampMidiPitch(event.pitch + pitchShiftSemitones);
      const noteName = midiToNoteName(transposedMidi);
      const duration = event.offset - event.onset;

      if (duration <= 0.01) {
        return null;
      }

      const signalDynamics = dynamicsAnalyzer?.getSignalDynamics(event.onset, duration) ?? null;
      const signalVelocity = dynamicsAnalyzer?.getVelocityMultiplier(
        event.onset,
        undefined,
        undefined,
        duration,
        signalDynamics,
      ) ?? 0.76;
      const baseVelocity = clamp(Math.pow(event.velocity / 96, 0.9), 0.32, 0.94);
      const audioContourVelocity = signalDynamics
        ? clamp(
            0.34
              + signalDynamics.normalizedIntensity * 0.26
              + signalDynamics.motion * 0.12
              + signalDynamics.attack * 0.1
              + signalDynamics.fullness * 0.08
              + signalVelocity * 0.16
              - signalDynamics.quietness * 0.06,
            0.3,
            1.02,
          )
        : clamp(signalVelocity, 0.42, 0.92);
      const blendedVelocity = signalDynamics
        ? clamp(
            audioContourVelocity * MELODIC_AUDIO_CONTOUR_WEIGHT
              + baseVelocity * MELODIC_MODEL_VELOCITY_WEIGHT,
            0.3,
            1.0,
          )
        : baseVelocity;

      return {
        noteName,
        midi: transposedMidi,
        onset: event.onset,
        offset: event.offset,
        velocityMultiplier: blendedVelocity,
        isBass: false,
      };
    })
    .filter((note): note is PreparedSheetSageMelodyNote => note !== null)
    .sort((left, right) => left.onset - right.onset || left.midi - right.midi);

  return stabilizePreparedMelodyNotes(preparedNotes);
}

export function buildScheduledSheetSageMelodyNotes(
  preparedNotes: PreparedSheetSageMelodyNote[],
  currentTime: number,
): ScheduledNote[] {
  if (!preparedNotes.length) {
    return [];
  }

  const schedulingTime = Math.max(0, currentTime);
  const onsetAdvanceSeconds = getMelodicPlaybackAdvanceSeconds();

  return preparedNotes
    .filter((event) => event.offset > schedulingTime + 0.01)
    .map((event) => {
      const audibleStart = Math.max(event.onset, currentTime);
      const duration = event.offset - audibleStart;

      if (duration <= 0.01) {
        return null;
      }

      return {
        noteName: event.noteName,
        midi: event.midi,
        startOffset: Math.max(0, event.onset - currentTime - onsetAdvanceSeconds),
        duration,
        velocityMultiplier: event.velocityMultiplier,
        isBass: event.isBass,
      } satisfies ScheduledNote;
    })
    .filter((note): note is ScheduledNote => note !== null)
    .sort((left, right) => left.startOffset - right.startOffset || left.midi - right.midi);
}

export function buildSheetSageExtraVisualNotes(
  result: SheetSageResult | null,
  color: string,
  pitchShiftSemitones: number = 0,
): SheetSageVisualNote[] {
  if (!result?.noteEvents?.length) {
    return [];
  }

  return result.noteEvents.map((event) => ({
    midi: clampMidiPitch(event.pitch + pitchShiftSemitones),
    startTime: event.onset,
    endTime: event.offset,
    color,
  }));
}
