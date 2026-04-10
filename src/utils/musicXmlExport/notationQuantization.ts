import type { SheetSageNoteEvent } from '@/types/sheetSage';
import {
  DIVISIONS_PER_QUARTER,
  GENERIC_DIVISION_SCALE,
  GENERIC_DIVISIONS_PER_QUARTER,
  GENERIC_ONSET_GROUPING_SECONDS,
  MIN_DIVISION,
} from './constants';
import { buildMelodyAbsoluteNoteEvents } from './absoluteEvents';
import { resolveAnacrusisSelection } from './leadSheet';
import {
  beatPositionToGenericDivisions,
  getGenericBeatGroupSize,
  quantizeDivision,
  secondsToDivisions,
  secondsToGenericDivisions,
} from './shared';
import type {
  GenericDurationMapping,
  MelodyQuantizationResult,
  NotationQuantOptions,
  ProtoChord,
  QuantizedNotationNoteEvent,
  TupletDisplayInfo,
} from './types';

export function buildGenericDurationMappings(divisionsPerQuarter: number): GenericDurationMapping[] {
  return [
    { value: divisionsPerQuarter * 4, type: 'whole' },
    { value: divisionsPerQuarter * 3, type: 'half', dots: 1 },
    { value: divisionsPerQuarter * 2, type: 'half' },
    { value: Math.round(divisionsPerQuarter * 1.5), type: 'quarter', dots: 1 },
    { value: divisionsPerQuarter, type: 'quarter' },
    { value: Math.round(divisionsPerQuarter * 0.75), type: 'eighth', dots: 1 },
    { value: Math.round(divisionsPerQuarter * 0.5), type: 'eighth' },
    { value: Math.round(divisionsPerQuarter * 0.375), type: '16th', dots: 1 },
    { value: Math.round(divisionsPerQuarter * 0.25), type: '16th' },
    { value: Math.round(divisionsPerQuarter * 0.125), type: '32nd' },
  ];
}

function getGenericMetricalStrength(
  division: number,
  timeSignature: number,
  divisionsPerQuarter: number,
): number {
  const divisionsPerMeasure = timeSignature * divisionsPerQuarter;
  const beatGroupSize = getGenericBeatGroupSize(timeSignature, divisionsPerQuarter);
  const halfBeat = Math.round(divisionsPerQuarter / 2);
  const quarterBeat = Math.round(divisionsPerQuarter / 4);

  if (division % divisionsPerMeasure === 0) return 6;
  if (division % beatGroupSize === 0) return 5;
  if (division % divisionsPerQuarter === 0) return 4;
  if (halfBeat > 0 && division % halfBeat === 0) return 2;
  if (quarterBeat > 0 && division % quarterBeat === 0) return 1;
  return 0;
}

export function getGenericTypeInfo(
  duration: number,
  divisionsPerQuarter: number,
): { type: GenericDurationMapping['type']; dots: number } {
  const mappings = buildGenericDurationMappings(divisionsPerQuarter);
  let best = mappings[0];
  let bestDistance = Math.abs(duration - best.value);

  for (let index = 1; index < mappings.length; index += 1) {
    const candidate = mappings[index];
    const distance = Math.abs(duration - candidate.value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return {
    type: best.type,
    dots: best.dots ?? 0,
  };
}

export function quantizeMelodyPlaybackAlignedNoteEvents(
  noteEvents: SheetSageNoteEvent[],
  options: NotationQuantOptions,
  beatTimes?: Array<number | null>,
): MelodyQuantizationResult {
  const bpm = options.bpm;
  const timeSignature = options.timeSignature;
  const melodyAbsoluteNotes = buildMelodyAbsoluteNoteEvents(noteEvents, beatTimes);
  const legacyQuantizedNotes = melodyAbsoluteNotes
    .map((note) => {
      const sourceStartDivision = note.beatOnset !== undefined
        ? Math.round(note.beatOnset * DIVISIONS_PER_QUARTER)
        : secondsToDivisions(note.onset, bpm);
      const sourceEndDivision = note.beatOffset !== undefined
        ? Math.round(note.beatOffset * DIVISIONS_PER_QUARTER)
        : secondsToDivisions(note.offset, bpm);
      const startDivision = quantizeDivision(sourceStartDivision);
      const rawEndDivision = Math.max(startDivision + MIN_DIVISION, sourceEndDivision);
      const endDivision = Math.max(startDivision + MIN_DIVISION, quantizeDivision(rawEndDivision));

      return {
        note,
        startDivision,
        endDivision,
      };
    })
    .filter((entry) => entry.endDivision > entry.startDivision)
    .sort((left, right) => (
      left.startDivision - right.startDivision
      || left.endDivision - right.endDivision
      || left.note.pitch - right.note.pitch
    ));
  const anacrusisSelection = resolveAnacrusisSelection({
    quantizedNotes: legacyQuantizedNotes.map((entry) => ({
      pitch: entry.note.pitch,
      startDivision: entry.startDivision,
      endDivision: entry.endDivision,
    })),
    timeSignature,
    enableSearch: options.enableLeadingSilenceAnacrusisSearch ?? true,
  });

  return {
    notes: legacyQuantizedNotes.map((entry) => ({
      ...entry.note,
      partId: 'PMelody' as const,
      rawStartDivision: entry.startDivision * GENERIC_DIVISION_SCALE,
      rawEndDivision: entry.endDivision * GENERIC_DIVISION_SCALE,
      rawChordStartDivision: entry.startDivision * GENERIC_DIVISION_SCALE,
      rawChordEndDivision: entry.endDivision * GENERIC_DIVISION_SCALE,
      startDivision: entry.startDivision * GENERIC_DIVISION_SCALE,
      endDivision: entry.endDivision * GENERIC_DIVISION_SCALE,
      staff: 1,
      voice: 1,
      tuplet: null,
    })),
    layout: {
      divisionsPerMeasure: anacrusisSelection.layout.divisionsPerMeasure * GENERIC_DIVISION_SCALE,
      firstMeasureDivisions: anacrusisSelection.layout.firstMeasureDivisions * GENERIC_DIVISION_SCALE,
    },
    anacrusisDivisions: anacrusisSelection.anacrusisDivisions * GENERIC_DIVISION_SCALE,
  };
}

function collectProtoChords(
  events: QuantizedNotationNoteEvent[],
  bpm: number,
  divisionsPerQuarter: number,
): ProtoChord[] {
  if (events.length === 0) {
    return [];
  }

  const groupingTolerance = Math.max(
    1,
    secondsToGenericDivisions(GENERIC_ONSET_GROUPING_SECONDS, bpm, divisionsPerQuarter),
  );
  const protoChords: ProtoChord[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const previous = protoChords[protoChords.length - 1];
    const isSameChordBoundary = previous?.rawChordStartDivision === event.rawChordStartDivision;
    const isBoundaryAttack = Math.abs(event.rawStartDivision - event.rawChordStartDivision) <= groupingTolerance;

    if (
      !previous
      || !isSameChordBoundary
      || Math.abs(event.rawStartDivision - previous.rawStartDivision) > groupingTolerance
    ) {
      protoChords.push({
        rawStartDivision: event.rawStartDivision,
        rawChordStartDivision: event.rawChordStartDivision,
        eventIndices: [index],
        hasChordBoundaryAttack: isBoundaryAttack,
        tuplet: null,
      });
      continue;
    }

    previous.eventIndices.push(index);
    previous.hasChordBoundaryAttack = previous.hasChordBoundaryAttack || isBoundaryAttack;
    previous.rawStartDivision = Math.round(
      (previous.rawStartDivision * (previous.eventIndices.length - 1) + event.rawStartDivision)
      / previous.eventIndices.length,
    );
  }

  return protoChords;
}

function getQuantStepCandidates(divisionsPerQuarter: number): number[] {
  return [
    divisionsPerQuarter,
    Math.round(divisionsPerQuarter / 2),
    Math.round(divisionsPerQuarter / 3),
    Math.round(divisionsPerQuarter / 4),
    Math.round(divisionsPerQuarter / 5),
    Math.round(divisionsPerQuarter / 6),
    Math.round(divisionsPerQuarter / 7),
    Math.round(divisionsPerQuarter / 8),
    Math.round(divisionsPerQuarter / 9),
    Math.round(divisionsPerQuarter / 10),
    Math.round(divisionsPerQuarter / 12),
    Math.round(divisionsPerQuarter / 16),
  ].filter((value, index, array) => value > 0 && array.indexOf(value) === index);
}

function reduceQuantIfDottedNote(
  shortestDuration: number,
  divisionsPerQuarter: number,
): number {
  const bases = [
    divisionsPerQuarter,
    Math.round(divisionsPerQuarter / 2),
    Math.round(divisionsPerQuarter / 4),
    Math.round(divisionsPerQuarter / 8),
  ];

  for (const base of bases) {
    const dottedValue = Math.round(base * 1.5);
    if (Math.abs(shortestDuration - dottedValue) <= Math.max(1, Math.round(base * 0.08))) {
      return Math.max(1, Math.round(base / 2));
    }
  }

  const candidates = getQuantStepCandidates(divisionsPerQuarter);
  let chosen = candidates[candidates.length - 1];
  let bestDistance = Math.abs(shortestDuration - chosen);

  for (const candidate of candidates) {
    const distance = Math.abs(shortestDuration - candidate);
    if (distance < bestDistance) {
      chosen = candidate;
      bestDistance = distance;
    }
  }

  return Math.max(1, chosen);
}

function resolveTupletDisplay(
  beatSpan: number,
  actualNotes: number,
  divisionsPerQuarter: number,
): TupletDisplayInfo {
  const displayCandidates = [
    divisionsPerQuarter,
    Math.round(divisionsPerQuarter / 2),
    Math.round(divisionsPerQuarter / 4),
    Math.round(divisionsPerQuarter / 8),
  ].filter((value) => value > 0);

  let bestCandidate: TupletDisplayInfo = {
    displayDuration: Math.round(divisionsPerQuarter / 2),
    type: 'eighth',
    normalNotes: 2,
  };
  let bestError = Number.POSITIVE_INFINITY;

  for (const displayDuration of displayCandidates) {
    const normalNotes = Math.max(1, Math.round(beatSpan / displayDuration));
    const actualDuration = Math.round((displayDuration * normalNotes) / actualNotes);
    const error = Math.abs(actualDuration - Math.round(beatSpan / actualNotes));

    if (error < bestError) {
      const type = getGenericTypeInfo(displayDuration, divisionsPerQuarter).type;
      bestError = error;
      bestCandidate = {
        displayDuration,
        type,
        normalNotes,
      };
    }
  }

  return bestCandidate;
}

function detectTupletsForProtoChords(
  protoChords: ProtoChord[],
  timeSignature: number,
  divisionsPerQuarter: number,
): void {
  const beatSpan = getGenericBeatGroupSize(timeSignature, divisionsPerQuarter);
  const validRatios = timeSignature >= 6 && timeSignature % 3 === 0 ? [2, 4] : [3, 5, 7, 9];
  const protoChordsByBeat = new Map<number, ProtoChord[]>();

  for (const protoChord of protoChords) {
    const beatIndex = Math.floor(protoChord.rawStartDivision / beatSpan);
    const bucket = protoChordsByBeat.get(beatIndex) ?? [];
    bucket.push(protoChord);
    protoChordsByBeat.set(beatIndex, bucket);
  }

  protoChordsByBeat.forEach((bucket, beatIndex) => {
    const ordered = bucket.sort((left, right) => left.rawStartDivision - right.rawStartDivision);
    const noteCount = ordered.length;

    if (!validRatios.includes(noteCount)) {
      return;
    }

    const beatStart = beatIndex * beatSpan;
    const targetStep = beatSpan / noteCount;
    const tupletError = ordered.reduce((sum, protoChord, index) => (
      sum + Math.abs((protoChord.rawStartDivision - beatStart) - Math.round(index * targetStep))
    ), 0);
    const regularError = getQuantStepCandidates(divisionsPerQuarter)
      .filter((step) => step <= beatSpan)
      .reduce((best, step) => {
        const error = ordered.reduce((sum, protoChord) => {
          const relative = protoChord.rawStartDivision - beatStart;
          const snapped = Math.round(relative / step) * step;
          return sum + Math.abs(relative - snapped);
        }, 0);
        return Math.min(best, error);
      }, Number.POSITIVE_INFINITY);

    if (tupletError >= regularError || noteCount < Math.min(3, validRatios[0])) {
      return;
    }

    const display = resolveTupletDisplay(beatSpan, noteCount, divisionsPerQuarter);

    ordered.forEach((protoChord, index) => {
      protoChord.tuplet = {
        actualNotes: noteCount,
        normalNotes: display.normalNotes,
        displayDuration: display.displayDuration,
        type: display.type,
        startDivision: beatStart,
        endDivision: beatStart + beatSpan,
        index,
        count: noteCount,
      };
    });
  });
}

function getLocalQuantStepForProtoChord(
  protoChord: ProtoChord,
  events: QuantizedNotationNoteEvent[],
  divisionsPerQuarter: number,
): number {
  if (protoChord.tuplet) {
    return Math.max(
      1,
      Math.round((protoChord.tuplet.displayDuration * protoChord.tuplet.normalNotes) / protoChord.tuplet.actualNotes),
    );
  }

  const durations = protoChord.eventIndices
    .map((eventIndex) => events[eventIndex])
    .map((event) => Math.max(1, event.rawEndDivision - event.rawStartDivision));
  const shortestDuration = Math.min(...durations);

  return reduceQuantIfDottedNote(shortestDuration, divisionsPerQuarter);
}

function buildProtoChordCandidates(
  protoChords: ProtoChord[],
  events: QuantizedNotationNoteEvent[],
  index: number,
  timeSignature: number,
  divisionsPerQuarter: number,
  preserveSourceOnsets: boolean,
): number[] {
  const protoChord = protoChords[index];
  const beatSpan = getGenericBeatGroupSize(timeSignature, divisionsPerQuarter);
  const localStep = getLocalQuantStepForProtoChord(protoChord, events, divisionsPerQuarter);
  const chordBoundaryStart = protoChord.rawChordStartDivision;

  if (protoChord.tuplet) {
    const tupletStep = Math.max(
      1,
      Math.round((protoChord.tuplet.displayDuration * protoChord.tuplet.normalNotes) / protoChord.tuplet.actualNotes),
    );
    return [protoChord.tuplet.startDivision + (protoChord.tuplet.index * tupletStep)];
  }

  if (preserveSourceOnsets && protoChord.hasChordBoundaryAttack) {
    return [chordBoundaryStart];
  }

  const previousRaw = protoChords[index - 1]?.rawStartDivision ?? 0;
  const nextRaw = protoChords[index + 1]?.rawStartDivision ?? (protoChord.rawStartDivision + beatSpan);
  const earliestAllowedStart = preserveSourceOnsets
    ? Math.max(chordBoundaryStart, protoChord.rawStartDivision)
    : Math.max(chordBoundaryStart, protoChord.rawStartDivision - beatSpan);
  const windowStart = Math.max(0, Math.max(previousRaw, earliestAllowedStart));
  const windowEnd = Math.max(
    windowStart + localStep,
    Math.min(nextRaw, protoChord.rawStartDivision + beatSpan),
  );
  const firstCandidate = Math.floor(windowStart / localStep) * localStep;
  const candidates = new Set<number>();

  for (let candidate = firstCandidate; candidate <= windowEnd + localStep; candidate += localStep) {
    if (candidate < windowStart || candidate > windowEnd) {
      continue;
    }
    candidates.add(candidate);
  }

  candidates.add(Math.round(protoChord.rawStartDivision / localStep) * localStep);
  return [...candidates].filter((candidate) => candidate >= 0).sort((left, right) => left - right);
}

function quantizeProtoChordOnsets(
  protoChords: ProtoChord[],
  events: QuantizedNotationNoteEvent[],
  timeSignature: number,
  divisionsPerQuarter: number,
  allowMergedOnsets: boolean,
  preserveSourceOnsets: boolean,
): number[] {
  if (protoChords.length === 0) {
    return [];
  }

  const candidateGrid = protoChords.map((_, index) => buildProtoChordCandidates(
    protoChords,
    events,
    index,
    timeSignature,
    divisionsPerQuarter,
    preserveSourceOnsets,
  ));
  const scores: Array<Array<{ score: number; previous: number }>> = candidateGrid.map((candidates) => (
    candidates.map(() => ({ score: Number.POSITIVE_INFINITY, previous: -1 }))
  ));

  for (let protoIndex = 0; protoIndex < protoChords.length; protoIndex += 1) {
    const rawStart = protoChords[protoIndex].rawStartDivision;
    const localStep = getLocalQuantStepForProtoChord(protoChords[protoIndex], events, divisionsPerQuarter);

    for (let candidateIndex = 0; candidateIndex < candidateGrid[protoIndex].length; candidateIndex += 1) {
      const candidate = candidateGrid[protoIndex][candidateIndex];
      const baseScore = (
        Math.abs(candidate - rawStart) / Math.max(1, localStep)
        + ((6 - getGenericMetricalStrength(candidate, timeSignature, divisionsPerQuarter)) * 0.35)
      );

      if (protoIndex === 0) {
        scores[protoIndex][candidateIndex] = { score: baseScore, previous: -1 };
        continue;
      }

      for (let previousIndex = 0; previousIndex < candidateGrid[protoIndex - 1].length; previousIndex += 1) {
        const previousCandidate = candidateGrid[protoIndex - 1][previousIndex];
        if (candidate < previousCandidate) {
          continue;
        }
        if (!allowMergedOnsets && candidate === previousCandidate) {
          continue;
        }

        const mergePenalty = candidate === previousCandidate ? 4 : 0;
        const transitionScore = scores[protoIndex - 1][previousIndex].score + baseScore + mergePenalty;

        if (transitionScore < scores[protoIndex][candidateIndex].score) {
          scores[protoIndex][candidateIndex] = {
            score: transitionScore,
            previous: previousIndex,
          };
        }
      }
    }
  }

  let bestCandidateIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  scores[scores.length - 1].forEach((candidate, index) => {
    if (candidate.score < bestScore) {
      bestScore = candidate.score;
      bestCandidateIndex = index;
    }
  });

  const selected = new Array<number>(protoChords.length);
  let cursor = bestCandidateIndex;

  for (let protoIndex = protoChords.length - 1; protoIndex >= 0; protoIndex -= 1) {
    selected[protoIndex] = candidateGrid[protoIndex][cursor];
    cursor = scores[protoIndex][cursor]?.previous ?? -1;
    if (cursor < 0 && protoIndex > 0) {
      cursor = 0;
    }
  }

  return selected;
}

function quantizeOffsets(
  events: QuantizedNotationNoteEvent[],
  timeSignature: number,
  divisionsPerQuarter: number,
): QuantizedNotationNoteEvent[] {
  const nextHandStart = new Map<QuantizedNotationNoteEvent, number>();
  const byHand = new Map<string, QuantizedNotationNoteEvent[]>();

  for (const event of events) {
    const handKey = event.handHint === 'left' || event.staffHint === 2 ? 'left' : 'right';
    const bucket = byHand.get(handKey) ?? [];
    bucket.push(event);
    byHand.set(handKey, bucket);
  }

  byHand.forEach((bucket) => {
    const ordered = bucket.sort((left, right) => (
      left.startDivision - right.startDivision
      || left.endDivision - right.endDivision
      || left.pitch - right.pitch
    ));

    for (let index = 0; index < ordered.length;) {
      const groupStart = ordered[index].startDivision;
      let nextIndex = index + 1;

      while (nextIndex < ordered.length && ordered[nextIndex].startDivision === groupStart) {
        nextIndex += 1;
      }

      const followingStart = ordered[nextIndex]?.startDivision ?? Number.POSITIVE_INFINITY;
      for (let groupIndex = index; groupIndex < nextIndex; groupIndex += 1) {
        nextHandStart.set(ordered[groupIndex], followingStart);
      }

      index = nextIndex;
    }
  });

  const byPitch = new Map<number, QuantizedNotationNoteEvent[]>();

  for (const event of events) {
    const bucket = byPitch.get(event.pitch) ?? [];
    bucket.push(event);
    byPitch.set(event.pitch, bucket);
  }

  byPitch.forEach((bucket) => {
    const ordered = bucket.sort((left, right) => left.startDivision - right.startDivision);

    for (let index = 0; index < ordered.length; index += 1) {
      const event = ordered[index];
      const next = ordered[index + 1];
      const nextSameHandStart = nextHandStart.get(event) ?? Number.POSITIVE_INFINITY;
      const localStep = event.tuplet
        ? Math.max(1, Math.round((event.tuplet.displayDuration * event.tuplet.normalNotes) / event.tuplet.actualNotes))
        : reduceQuantIfDottedNote(
          Math.max(1, event.rawEndDivision - event.rawStartDivision),
          divisionsPerQuarter,
        );
      const nextSamePitchStart = next?.startDivision ?? Number.POSITIVE_INFINITY;
      const targetEnd = Math.max(
        event.startDivision + localStep,
        Math.min(event.rawChordEndDivision, nextSamePitchStart),
      );
      const maxStructuralEnd = Math.max(
        event.startDivision + localStep,
        Math.min(event.rawEndDivision, targetEnd, nextSameHandStart),
      );
      const floorCandidate = Math.max(event.startDivision + localStep, Math.floor(maxStructuralEnd / localStep) * localStep);
      const roundCandidate = Math.max(event.startDivision + localStep, Math.round(maxStructuralEnd / localStep) * localStep);
      const ceilCandidate = Math.max(event.startDivision + localStep, Math.ceil(maxStructuralEnd / localStep) * localStep);
      const candidates = [...new Set([floorCandidate, roundCandidate, ceilCandidate])]
        .filter((candidate) => candidate <= maxStructuralEnd);

      let bestEnd = candidates[0] ?? maxStructuralEnd;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const candidate of (candidates.length > 0 ? candidates : [maxStructuralEnd])) {
        const overlapPenalty = next && candidate > next.startDivision
          ? (candidate - next.startDivision) * 4
          : 0;
        const score = (
          Math.abs(candidate - maxStructuralEnd) / Math.max(1, localStep)
          + overlapPenalty
          + ((6 - getGenericMetricalStrength(candidate, timeSignature, divisionsPerQuarter)) * 0.15)
        );

        if (score < bestScore) {
          bestScore = score;
          bestEnd = candidate;
        }
      }

      event.endDivision = Math.max(event.startDivision + localStep, Math.min(bestEnd, maxStructuralEnd));
      if (next && event.endDivision > next.startDivision) {
        event.endDivision = Math.max(event.startDivision + localStep, next.startDivision);
      }
      event.endDivision = Math.min(event.endDivision, maxStructuralEnd);
    }
  });

  return events.filter((event) => event.endDivision > event.startDivision);
}

export function quantizeAbsoluteNoteEvents(
  noteEvents: Array<QuantizedNotationNoteEvent | Omit<QuantizedNotationNoteEvent, 'partId' | 'rawStartDivision' | 'rawEndDivision' | 'rawChordStartDivision' | 'rawChordEndDivision' | 'startDivision' | 'endDivision' | 'staff' | 'voice' | 'tuplet'>>,
  partId: QuantizedNotationNoteEvent['partId'],
  options: NotationQuantOptions,
): QuantizedNotationNoteEvent[] {
  const divisionsPerQuarter = options.divisionsPerQuarter ?? GENERIC_DIVISIONS_PER_QUARTER;
  const seededEvents: QuantizedNotationNoteEvent[] = noteEvents.map((note) => ({
    ...note,
    partId,
    rawStartDivision: Number.isFinite(note.beatOnset)
      ? beatPositionToGenericDivisions(note.beatOnset ?? 0, divisionsPerQuarter)
      : secondsToGenericDivisions(note.onset, options.bpm, divisionsPerQuarter),
    rawEndDivision: Math.max(
      (Number.isFinite(note.beatOnset)
        ? beatPositionToGenericDivisions(note.beatOnset ?? 0, divisionsPerQuarter)
        : secondsToGenericDivisions(note.onset, options.bpm, divisionsPerQuarter)) + 1,
      Number.isFinite(note.beatOffset)
        ? beatPositionToGenericDivisions(note.beatOffset ?? 0, divisionsPerQuarter)
        : secondsToGenericDivisions(note.offset, options.bpm, divisionsPerQuarter),
    ),
    rawChordStartDivision: Number.isFinite(note.chordStartBeat)
      ? beatPositionToGenericDivisions(note.chordStartBeat ?? 0, divisionsPerQuarter)
      : secondsToGenericDivisions(note.chordStartTime, options.bpm, divisionsPerQuarter),
    rawChordEndDivision: Math.max(
      (Number.isFinite(note.chordStartBeat)
        ? beatPositionToGenericDivisions(note.chordStartBeat ?? 0, divisionsPerQuarter)
        : secondsToGenericDivisions(note.chordStartTime, options.bpm, divisionsPerQuarter)) + 1,
      Number.isFinite(note.chordEndBeat)
        ? beatPositionToGenericDivisions(note.chordEndBeat ?? 0, divisionsPerQuarter)
        : secondsToGenericDivisions(note.chordEndTime ?? note.offset, options.bpm, divisionsPerQuarter),
    ),
    startDivision: 0,
    endDivision: 0,
    staff: note.staffHint ?? 1,
    voice: 1,
    tuplet: null,
  })).sort((left, right) => (
    left.rawStartDivision - right.rawStartDivision
    || left.rawEndDivision - right.rawEndDivision
    || left.pitch - right.pitch
  ));

  if (seededEvents.length === 0) {
    return [];
  }

  const protoChords = collectProtoChords(seededEvents, options.bpm, divisionsPerQuarter);
  detectTupletsForProtoChords(protoChords, options.timeSignature, divisionsPerQuarter);
  const quantizedOnsets = quantizeProtoChordOnsets(
    protoChords,
    seededEvents,
    options.timeSignature,
    divisionsPerQuarter,
    options.allowMergedOnsets ?? true,
    options.preserveSourceOnsets ?? false,
  );

  protoChords.forEach((protoChord, protoIndex) => {
    protoChord.eventIndices.forEach((eventIndex) => {
      seededEvents[eventIndex].startDivision = quantizedOnsets[protoIndex] ?? seededEvents[eventIndex].rawStartDivision;
      seededEvents[eventIndex].tuplet = protoChord.tuplet ? { ...protoChord.tuplet } : null;
    });
  });

  return quantizeOffsets(seededEvents, options.timeSignature, divisionsPerQuarter);
}
