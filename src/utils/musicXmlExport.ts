import type { SheetSageNoteEvent } from '@/types/sheetSage';
import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';
import { getAccidentalPreferenceFromKey } from '@/utils/chordUtils';

const DIVISIONS_PER_QUARTER = 24;
const DEFAULT_BPM = 120;
const MIN_DIVISION = 6;
const EIGHTH_NOTE_DIVISIONS = DIVISIONS_PER_QUARTER / 2;

type DurationMapping = {
  value: number;
  type: 'whole' | 'half' | 'quarter' | 'eighth' | '16th';
  dots?: number;
};

const DURATION_MAPPINGS: DurationMapping[] = [
  { value: 96, type: 'whole' as const },
  { value: 72, type: 'half' as const, dots: 1 },
  { value: 48, type: 'half' as const },
  { value: 36, type: 'quarter' as const, dots: 1 },
  { value: 24, type: 'quarter' as const },
  { value: 18, type: 'eighth' as const, dots: 1 },
  { value: 12, type: 'eighth' as const },
  { value: 6, type: '16th' as const },
] as const;

export interface LeadSheetChordEvent {
  chordName: string;
  startTime: number;
  endTime: number;
}

export interface LeadSheetMeasureChord {
  measureIndex: number;
  labels: string[];
}

export interface MusicXmlExportOptions {
  bpm?: number;
  timeSignature?: number;
  title?: string;
  keySignature?: string | null;
  enableLeadingSilenceAnacrusisSearch?: boolean;
}

interface QuantizedNoteEvent {
  pitch: number;
  startDivision: number;
  endDivision: number;
}

interface MeasureLayoutConfig {
  divisionsPerMeasure: number;
  firstMeasureDivisions: number;
}

interface AnacrusisSelectionResult {
  anacrusisDivisions: number;
  layout: MeasureLayoutConfig;
  quantizedNotes: QuantizedNoteEvent[];
}

interface MeasureNoteSegment {
  measureIndex: number;
  startInMeasure: number;
  duration: number;
  pitch: number;
  tieStart: boolean;
  tieStop: boolean;
  beatCarryDuration: number;
}

type MeasureEvent =
  | { kind: 'rest'; duration: number; startInMeasure: number }
  | {
      kind: 'note';
      pitch: number;
      duration: number;
      startInMeasure: number;
      tieStart: boolean;
      tieStop: boolean;
    };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatLeadSheetChordLabel(chordName: string, keySignature?: string | null): string {
  if (!chordName || chordName === 'N' || chordName === 'N/C' || chordName === 'N.C.') {
    return '';
  }

  const accidentalPreference = getAccidentalPreferenceFromKey(keySignature) ?? undefined;
  const formatted = formatChordWithMusicalSymbols(chordName, false, accidentalPreference);
  return stripHtmlTags(formatted);
}

function normalizeKeySignature(value?: string | null): string {
  return value
    ?.trim()
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/\s+/g, ' ')
    .toLowerCase() ?? '';
}

function getKeyFifths(keySignature?: string | null): number {
  const normalized = normalizeKeySignature(keySignature);
  if (!normalized) {
    return 0;
  }

  const majorMap: Record<string, number> = {
    'cb': -7,
    'gb': -6,
    'db': -5,
    'ab': -4,
    'eb': -3,
    'bb': -2,
    'f': -1,
    'c': 0,
    'g': 1,
    'd': 2,
    'a': 3,
    'e': 4,
    'b': 5,
    'f#': 6,
    'c#': 7,
  };

  const minorMap: Record<string, number> = {
    'ab': -7,
    'eb': -6,
    'bb': -5,
    'f': -4,
    'c': -3,
    'g': -2,
    'd': -1,
    'a': 0,
    'e': 1,
    'b': 2,
    'f#': 3,
    'c#': 4,
    'g#': 5,
    'd#': 6,
    'a#': 7,
  };

  const match = normalized.match(/^([a-g](?:#|b)?)(?:\s+(major|minor))?$/);
  if (!match) {
    return 0;
  }

  const [, root, quality] = match;
  if (quality === 'minor') {
    return minorMap[root] ?? 0;
  }

  return majorMap[root] ?? 0;
}

function pitchToMusicXml(
  pitch: number,
  accidentalPreference: 'sharp' | 'flat' | null | undefined,
): { step: string; alter?: number; octave: number } {
  const normalized = Math.max(0, Math.min(127, Math.round(pitch)));
  const octave = Math.floor(normalized / 12) - 1;
  const pitchClass = normalized % 12;

  if (accidentalPreference === 'flat') {
    switch (pitchClass) {
      case 0: return { step: 'C', octave };
      case 1: return { step: 'D', alter: -1, octave };
      case 2: return { step: 'D', octave };
      case 3: return { step: 'E', alter: -1, octave };
      case 4: return { step: 'E', octave };
      case 5: return { step: 'F', octave };
      case 6: return { step: 'G', alter: -1, octave };
      case 7: return { step: 'G', octave };
      case 8: return { step: 'A', alter: -1, octave };
      case 9: return { step: 'A', octave };
      case 10: return { step: 'B', alter: -1, octave };
      default: return { step: 'B', octave };
    }
  }

  switch (pitchClass) {
    case 0: return { step: 'C', octave };
    case 1: return { step: 'C', alter: 1, octave };
    case 2: return { step: 'D', octave };
    case 3: return { step: 'D', alter: 1, octave };
    case 4: return { step: 'E', octave };
    case 5: return { step: 'F', octave };
    case 6: return { step: 'F', alter: 1, octave };
    case 7: return { step: 'G', octave };
    case 8: return { step: 'G', alter: 1, octave };
    case 9: return { step: 'A', octave };
    case 10: return { step: 'A', alter: 1, octave };
    default: return { step: 'B', octave };
  }
}

function secondsToDivisions(seconds: number, bpm: number): number {
  return Math.round(seconds * (bpm / 60) * DIVISIONS_PER_QUARTER);
}

function divisionsToSeconds(divisions: number, bpm: number): number {
  if (bpm <= 0) {
    return 0;
  }

  return divisions * (60 / (bpm * DIVISIONS_PER_QUARTER));
}

function quantizeDivision(value: number): number {
  return Math.max(0, Math.round(value / MIN_DIVISION) * MIN_DIVISION);
}

function quantizeNotes(notes: SheetSageNoteEvent[], bpm: number): QuantizedNoteEvent[] {
  return notes
    .map((note) => {
      const startDivision = quantizeDivision(secondsToDivisions(note.onset, bpm));
      const rawEndDivision = Math.max(startDivision + MIN_DIVISION, secondsToDivisions(note.offset, bpm));
      const endDivision = Math.max(startDivision + MIN_DIVISION, quantizeDivision(rawEndDivision));

      return {
        pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
        startDivision,
        endDivision,
      };
    })
    .filter((note) => note.endDivision > note.startDivision)
    .sort((left, right) => (
      left.startDivision - right.startDivision
      || left.endDivision - right.endDivision
      || left.pitch - right.pitch
    ));
}

function buildMeasureLayout(transferDivisions: number, divisionsPerMeasure: number): MeasureLayoutConfig {
  const normalizedTransfer = Math.max(0, Math.round(transferDivisions));
  const pickupDivisions = divisionsPerMeasure > 0
    ? normalizedTransfer % divisionsPerMeasure
    : 0;

  return {
    divisionsPerMeasure,
    firstMeasureDivisions: pickupDivisions > 0 ? pickupDivisions : divisionsPerMeasure,
  };
}

function getMeasureStartDivision(measureIndex: number, layout: MeasureLayoutConfig): number {
  if (measureIndex <= 0) {
    return 0;
  }

  return layout.firstMeasureDivisions + ((measureIndex - 1) * layout.divisionsPerMeasure);
}

function getMeasureLengthDivisions(measureIndex: number, layout: MeasureLayoutConfig): number {
  return measureIndex === 0 ? layout.firstMeasureDivisions : layout.divisionsPerMeasure;
}

function getMeasureIndexForDivision(division: number, layout: MeasureLayoutConfig): number {
  if (division < layout.firstMeasureDivisions) {
    return 0;
  }

  if (layout.divisionsPerMeasure <= 0) {
    return 0;
  }

  return 1 + Math.floor((division - layout.firstMeasureDivisions) / layout.divisionsPerMeasure);
}

function splitNoteAcrossMeasureLayout(note: QuantizedNoteEvent, layout: MeasureLayoutConfig): MeasureNoteSegment[] {
  const segments: MeasureNoteSegment[] = [];
  let cursor = note.startDivision;

  while (cursor < note.endDivision) {
    const measureIndex = getMeasureIndexForDivision(cursor, layout);
    const measureStart = getMeasureStartDivision(measureIndex, layout);
    const measureEnd = measureStart + getMeasureLengthDivisions(measureIndex, layout);
    const segmentEnd = Math.min(note.endDivision, measureEnd);
    const elapsedBeforeSegment = cursor - note.startDivision;
    const beatProgress = ((elapsedBeforeSegment % DIVISIONS_PER_QUARTER) + DIVISIONS_PER_QUARTER) % DIVISIONS_PER_QUARTER;
    const beatCarryDuration = beatProgress === 0 ? 0 : DIVISIONS_PER_QUARTER - beatProgress;

    segments.push({
      measureIndex,
      startInMeasure: cursor - measureStart,
      duration: Math.max(MIN_DIVISION, segmentEnd - cursor),
      pitch: note.pitch,
      tieStart: segmentEnd < note.endDivision,
      tieStop: cursor > note.startDivision,
      beatCarryDuration,
    });

    cursor = segmentEnd;
  }

  return segments;
}

function buildAnacrusisTransferCandidates(leadingSilenceDivisions: number): number[] {
  const maxTransfer = Math.max(0, leadingSilenceDivisions);
  if (maxTransfer === 0) {
    return [0];
  }

  const candidates: number[] = [0];

  for (let candidate = EIGHTH_NOTE_DIVISIONS; candidate <= maxTransfer; candidate += EIGHTH_NOTE_DIVISIONS) {
    candidates.push(candidate);
  }

  if (candidates[candidates.length - 1] !== maxTransfer) {
    candidates.push(maxTransfer);
  }

  return [...new Set(candidates)].sort((left, right) => left - right);
}

function countTieStartsForLayout(
  quantizedNotes: QuantizedNoteEvent[],
  layout: MeasureLayoutConfig,
  timeSignature: number,
): number {
  if (quantizedNotes.length === 0) {
    return 0;
  }

  const measureSegments = quantizedNotes.flatMap((note) => splitNoteAcrossMeasureLayout(note, layout));
  const segmentsByMeasure = new Map<number, MeasureNoteSegment[]>();

  for (const segment of measureSegments) {
    const existing = segmentsByMeasure.get(segment.measureIndex) ?? [];
    existing.push(segment);
    segmentsByMeasure.set(segment.measureIndex, existing);
  }

  let tieStartCount = 0;

  for (const [measureIndex, segments] of segmentsByMeasure) {
    const orderedSegments = [...segments].sort(
      (left, right) => left.startInMeasure - right.startInMeasure || left.pitch - right.pitch,
    );
    const measureLength = getMeasureLengthDivisions(measureIndex, layout);
    const events = buildMeasureEventsWithMeter(orderedSegments, measureLength, timeSignature);
    tieStartCount += events.filter((event) => event.kind === 'note' && event.tieStart).length;
  }

  return tieStartCount;
}

function resolveAnacrusisSelection(params: {
  quantizedNotes: QuantizedNoteEvent[];
  timeSignature: number;
  enableSearch: boolean;
}): AnacrusisSelectionResult {
  const { quantizedNotes, timeSignature, enableSearch } = params;
  const divisionsPerMeasure = timeSignature * DIVISIONS_PER_QUARTER;

  if (!enableSearch || quantizedNotes.length === 0 || divisionsPerMeasure <= 0) {
    return {
      anacrusisDivisions: 0,
      layout: buildMeasureLayout(0, divisionsPerMeasure),
      quantizedNotes,
    };
  }

  const leadingSilenceDivisions = quantizedNotes.reduce(
    (min, note) => Math.min(min, note.startDivision),
    Number.POSITIVE_INFINITY,
  );

  if (!Number.isFinite(leadingSilenceDivisions) || leadingSilenceDivisions <= 0) {
    return {
      anacrusisDivisions: 0,
      layout: buildMeasureLayout(0, divisionsPerMeasure),
      quantizedNotes,
    };
  }

  const minimumSearchLeadIn = EIGHTH_NOTE_DIVISIONS;
  if (leadingSilenceDivisions < minimumSearchLeadIn) {
    return {
      anacrusisDivisions: 0,
      layout: buildMeasureLayout(0, divisionsPerMeasure),
      quantizedNotes,
    };
  }

  type ScoredCandidate = {
    anacrusisDivisions: number;
    tieStartCount: number;
    firstNoteStartInMeasure: number;
    layout: MeasureLayoutConfig;
  };

  const candidates = buildAnacrusisTransferCandidates(leadingSilenceDivisions);

  const isBetterCandidate = (
    candidate: ScoredCandidate,
    incumbent: ScoredCandidate | null,
  ): boolean => {
    if (!incumbent) {
      return true;
    }

    if (candidate.tieStartCount !== incumbent.tieStartCount) {
      return candidate.tieStartCount < incumbent.tieStartCount;
    }

    if (candidate.firstNoteStartInMeasure !== incumbent.firstNoteStartInMeasure) {
      return candidate.firstNoteStartInMeasure < incumbent.firstNoteStartInMeasure;
    }

    if (candidate.anacrusisDivisions !== incumbent.anacrusisDivisions) {
      return candidate.anacrusisDivisions > incumbent.anacrusisDivisions;
    }

    return false;
  };

  const isBetterAnacrusisCandidate = (
    candidate: ScoredCandidate,
    incumbent: ScoredCandidate | null,
  ): boolean => {
    if (!incumbent) {
      return true;
    }

    if (candidate.firstNoteStartInMeasure !== incumbent.firstNoteStartInMeasure) {
      return candidate.firstNoteStartInMeasure < incumbent.firstNoteStartInMeasure;
    }

    if (candidate.tieStartCount !== incumbent.tieStartCount) {
      return candidate.tieStartCount < incumbent.tieStartCount;
    }

    if (candidate.anacrusisDivisions !== incumbent.anacrusisDivisions) {
      return candidate.anacrusisDivisions > incumbent.anacrusisDivisions;
    }

    return false;
  };

  let bestCandidate: ScoredCandidate | null = null;
  let bestAnacrusisCandidate: ScoredCandidate | null = null;
  const seenLayoutKeys = new Set<number>();

  for (const transferDivisions of candidates) {
    const layout = buildMeasureLayout(transferDivisions, divisionsPerMeasure);
    const anacrusisDivisions = layout.firstMeasureDivisions < divisionsPerMeasure
      ? layout.firstMeasureDivisions
      : 0;
    const layoutKey = anacrusisDivisions;

    if (seenLayoutKeys.has(layoutKey)) {
      continue;
    }
    seenLayoutKeys.add(layoutKey);

    const firstNoteStartDivision = quantizedNotes.reduce(
      (min, note) => Math.min(min, note.startDivision),
      Number.POSITIVE_INFINITY,
    );
    const firstNoteMeasureIndex = getMeasureIndexForDivision(firstNoteStartDivision, layout);
    const firstNoteStartInMeasure = firstNoteStartDivision - getMeasureStartDivision(firstNoteMeasureIndex, layout);
    const tieStartCount = countTieStartsForLayout(quantizedNotes, layout, timeSignature);

    const scoredCandidate: ScoredCandidate = {
      anacrusisDivisions,
      tieStartCount,
      firstNoteStartInMeasure,
      layout,
    };

    if (isBetterCandidate(scoredCandidate, bestCandidate)) {
      bestCandidate = scoredCandidate;
    }

    if (scoredCandidate.anacrusisDivisions > 0 && isBetterAnacrusisCandidate(scoredCandidate, bestAnacrusisCandidate)) {
      bestAnacrusisCandidate = scoredCandidate;
    }
  }

  if (!bestCandidate) {
    return {
      anacrusisDivisions: 0,
      layout: buildMeasureLayout(0, divisionsPerMeasure),
      quantizedNotes,
    };
  }

  let selectedCandidate = bestCandidate;

  if (selectedCandidate.anacrusisDivisions === 0 && bestAnacrusisCandidate) {
    const tieGap = bestAnacrusisCandidate.tieStartCount - selectedCandidate.tieStartCount;
    const firstNoteAlignmentGain = selectedCandidate.firstNoteStartInMeasure - bestAnacrusisCandidate.firstNoteStartInMeasure;
    const tieGapTolerance = Math.max(12, Math.ceil(selectedCandidate.tieStartCount * 0.06));
    const alignmentGainSteps = Math.max(0, Math.floor(firstNoteAlignmentGain / EIGHTH_NOTE_DIVISIONS));
    const adaptiveTieGapTolerance = tieGapTolerance + Math.max(0, alignmentGainSteps - 1) * 6;

    const shouldPreferAnacrusis =
      firstNoteAlignmentGain >= EIGHTH_NOTE_DIVISIONS
      && tieGap <= adaptiveTieGapTolerance;

    if (shouldPreferAnacrusis) {
      selectedCandidate = bestAnacrusisCandidate;
    }
  }

  return {
    anacrusisDivisions: selectedCandidate.anacrusisDivisions,
    layout: selectedCandidate.layout,
    quantizedNotes,
  };
}

function getBeatGroupSize(timeSignature: number): number {
  if (timeSignature >= 6 && timeSignature % 3 === 0) {
    return DIVISIONS_PER_QUARTER * 3;
  }

  return DIVISIONS_PER_QUARTER;
}

function isCompoundTime(timeSignature: number): boolean {
  return timeSignature >= 6 && timeSignature % 3 === 0;
}

function fitsWithinGroup(start: number, duration: number, groupSize: number): boolean {
  if (groupSize <= 0) {
    return false;
  }

  const groupStart = Math.floor(start / groupSize) * groupSize;
  return start + duration <= groupStart + groupSize;
}

function isDurationAllowedAtPosition(
  start: number,
  duration: number,
  divisionsPerMeasure: number,
  timeSignature: number,
): boolean {
  if (start + duration > divisionsPerMeasure) {
    return false;
  }

  const compound = isCompoundTime(timeSignature);
  const beatSize = DIVISIONS_PER_QUARTER;
  const compoundBeatSize = beatSize * 3;
  const halfMeasureSize = timeSignature === 4 ? divisionsPerMeasure / 2 : 0;

  switch (duration) {
    case 96:
      return start === 0 && duration <= divisionsPerMeasure;
    case 72:
      if (timeSignature === 3 && divisionsPerMeasure === 72) {
        return start === 0;
      }

      return compound
        ? fitsWithinGroup(start, duration, compoundBeatSize)
        : false;
    case 48:
      if (halfMeasureSize > 0) {
        return fitsWithinGroup(start, duration, halfMeasureSize);
      }
      return fitsWithinGroup(start, duration, divisionsPerMeasure);
    case 36:
      return compound
        ? fitsWithinGroup(start, duration, compoundBeatSize)
        : false;
    case 24:
      return fitsWithinGroup(start, duration, beatSize);
    case 18:
    case 12:
    case 6:
      return fitsWithinGroup(start, duration, beatSize);
    default:
      return false;
  }
}

function splitDurationIntoNotationValues(
  start: number,
  duration: number,
  divisionsPerMeasure: number,
  timeSignature: number,
): number[] {
  let remaining = duration;
  const values: number[] = [];
  const originStart = start;
  let cursor = start;
  const orderedValues = [96, 72, 48, 36, 24, 18, 12, 6];

  while (remaining > 0) {
    const nextValue = orderedValues.find((value) => (
      !(value === 48 && !isCompoundTime(timeSignature) && originStart % DIVISIONS_PER_QUARTER !== 0)
      &&
      value <= remaining
      && isDurationAllowedAtPosition(cursor, value, divisionsPerMeasure, timeSignature)
    )) ?? MIN_DIVISION;
    values.push(nextValue);
    remaining -= nextValue;
    cursor += nextValue;
  }

  return values;
}

function resolveCarryOverNotationValues(
  segment: MeasureNoteSegment,
  divisionsPerMeasure: number,
  timeSignature: number,
): number[] | null {
  if (
    segment.startInMeasure !== 0
    || !segment.tieStop
    || isCompoundTime(timeSignature)
  ) {
    return null;
  }

  const carryDuration = segment.beatCarryDuration;
  if (![6, 12, 18].includes(carryDuration)) {
    return null;
  }

  if (
    segment.duration === divisionsPerMeasure
    && isDurationAllowedAtPosition(0, divisionsPerMeasure, divisionsPerMeasure, timeSignature)
  ) {
    return [divisionsPerMeasure];
  }

  if (segment.duration < DIVISIONS_PER_QUARTER) {
    return null;
  }

  // Collapse the carried beat (e.g. 8th+8th or 16th+dotted-8th) into a single quarter
  // whenever this does not break the meter, reducing unnecessary ties.
  const values: number[] = [DIVISIONS_PER_QUARTER];
  const trailingDuration = segment.duration - DIVISIONS_PER_QUARTER;

  if (trailingDuration > 0) {
    const trailingValues = splitDurationIntoNotationValues(
      DIVISIONS_PER_QUARTER,
      trailingDuration,
      divisionsPerMeasure,
      timeSignature,
    );
    values.push(...trailingValues);
  }

  return values;
}

function expandSegmentForMetricStructure(
  segment: MeasureNoteSegment,
  divisionsPerMeasure: number,
  timeSignature: number,
): MeasureEvent[] {
  const carryOverValues = resolveCarryOverNotationValues(
    segment,
    divisionsPerMeasure,
    timeSignature,
  );

  const notationValues = carryOverValues
    ?? splitDurationIntoNotationValues(
      segment.startInMeasure,
      segment.duration,
      divisionsPerMeasure,
      timeSignature,
    );
  let cursor = segment.startInMeasure;

  const notePieces = notationValues.map((value, index) => {
    const isFirstFragment = index === 0;
    const isLastFragment = index === notationValues.length - 1;

    const event: MeasureEvent = {
      kind: 'note',
      pitch: segment.pitch,
      duration: value,
      startInMeasure: cursor,
      tieStop: !isFirstFragment || segment.tieStop,
      tieStart: !isLastFragment || segment.tieStart,
    };

    cursor += value;
    return event;
  });

  return notePieces;
}

function buildMeasureEventsWithMeter(
  segments: MeasureNoteSegment[],
  divisionsPerMeasure: number,
  timeSignature: number,
): MeasureEvent[] {
  if (segments.length === 0) {
    return [{ kind: 'rest', duration: divisionsPerMeasure, startInMeasure: 0 }];
  }

  const events: MeasureEvent[] = [];
  let cursor = 0;

  for (const segment of segments) {
    if (segment.startInMeasure > cursor) {
      events.push({
        kind: 'rest',
        duration: segment.startInMeasure - cursor,
        startInMeasure: cursor,
      });
    }

    const noteEvents = expandSegmentForMetricStructure(segment, divisionsPerMeasure, timeSignature);
    events.push(...noteEvents);

    cursor = segment.startInMeasure + segment.duration;
  }

  if (cursor < divisionsPerMeasure) {
    events.push({
      kind: 'rest',
      duration: divisionsPerMeasure - cursor,
      startInMeasure: cursor,
    });
  }

  return events;
}

function getTypeInfo(duration: number): { type: DurationMapping['type']; dots: number } {
  let best = DURATION_MAPPINGS[0];
  let bestDistance = Math.abs(duration - best.value);

  for (let index = 1; index < DURATION_MAPPINGS.length; index += 1) {
    const candidate = DURATION_MAPPINGS[index];
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

function renderTieNotation(tieStart: boolean, tieStop: boolean): string {
  if (!tieStart && !tieStop) {
    return '';
  }

  const tieXml = [
    tieStop ? '<tie type="stop"/>' : '',
    tieStart ? '<tie type="start"/>' : '',
  ].join('');

  const tiedXml = [
    tieStop ? '<tied type="stop"/>' : '',
    tieStart ? '<tied type="start"/>' : '',
  ].join('');

  return `${tieXml}<notations>${tiedXml}</notations>`;
}

function getBeamTag(
  events: MeasureEvent[],
  index: number,
  level: 1 | 2,
  timeSignature: number,
): string {
  const event = events[index];
  if (!event || event.kind !== 'note') {
    return '';
  }

  const levelMax = level === 1 ? 18 : 6;
  if (event.duration > levelMax) {
    return '';
  }

  const beatGroupSize = getBeatGroupSize(timeSignature);
  const eventGroup = Math.floor(event.startInMeasure / beatGroupSize);

  const previous = events[index - 1];
  const previousEligible = previous?.kind === 'note'
    && previous.duration <= levelMax
    && Math.floor(previous.startInMeasure / beatGroupSize) === eventGroup;

  const next = events[index + 1];
  const nextEligible = next?.kind === 'note'
    && next.duration <= levelMax
    && Math.floor(next.startInMeasure / beatGroupSize) === eventGroup;

  if (level === 2) {
    const previousPrimaryEligible = previous?.kind === 'note'
      && previous.duration <= 18
      && Math.floor(previous.startInMeasure / beatGroupSize) === eventGroup;

    const nextPrimaryEligible = next?.kind === 'note'
      && next.duration <= 18
      && Math.floor(next.startInMeasure / beatGroupSize) === eventGroup;

    if (!previousEligible && !nextEligible) {
      if (previousPrimaryEligible) {
        return `<beam number="${level}">backward hook</beam>`;
      }

      if (nextPrimaryEligible) {
        return `<beam number="${level}">forward hook</beam>`;
      }

      return '';
    }
  }

  if (!previousEligible && !nextEligible) {
    return '';
  }

  if (!previousEligible) {
    return `<beam number="${level}">begin</beam>`;
  }

  if (!nextEligible) {
    return `<beam number="${level}">end</beam>`;
  }

  return `<beam number="${level}">continue</beam>`;
}

function renderMeasureEvent(
  event: MeasureEvent,
  events: MeasureEvent[],
  index: number,
  timeSignature: number,
  accidentalPreference: 'sharp' | 'flat' | null | undefined,
  options?: { voice?: number; staff?: number },
): string {
  const voice = options?.voice ?? 1;
  const staff = options?.staff ?? 1;
  const { type, dots } = getTypeInfo(event.duration);
  const dotXml = '<dot/>'.repeat(dots);

  if (event.kind === 'rest') {
    return `<note><rest/><duration>${event.duration}</duration><voice>${voice}</voice><type>${type}</type>${dotXml}<staff>${staff}</staff></note>`;
  }

  const pitch = pitchToMusicXml(event.pitch, accidentalPreference);
  const alterXml = pitch.alter !== undefined ? `<alter>${pitch.alter}</alter>` : '';
  const beamXml = `${getBeamTag(events, index, 1, timeSignature)}${getBeamTag(events, index, 2, timeSignature)}`;

  return (
    `<note>`
    + `<pitch><step>${pitch.step}</step>${alterXml}<octave>${pitch.octave}</octave></pitch>`
    + `<duration>${event.duration}</duration>`
    + `<voice>${voice}</voice>`
    + `<type>${type}</type>`
    + `${dotXml}`
    + `${beamXml}`
    + `<staff>${staff}</staff>`
    + `${renderTieNotation(event.tieStart, event.tieStop)}`
    + `</note>`
  );
}

export function buildLeadSheetMeasureChords(
  chordEvents: LeadSheetChordEvent[],
  options?: MusicXmlExportOptions,
): LeadSheetMeasureChord[] {
  const bpm = options?.bpm ?? DEFAULT_BPM;
  const timeSignature = options?.timeSignature ?? 4;
  const measureDurationSeconds = timeSignature * (60 / bpm);

  const measureMap = new Map<number, string[]>();

  for (const chordEvent of chordEvents) {
    const measureIndex = Math.max(0, Math.floor(chordEvent.startTime / measureDurationSeconds));
    const existing = measureMap.get(measureIndex) ?? [];
    const displayLabel = formatLeadSheetChordLabel(chordEvent.chordName, options?.keySignature);
    if (!displayLabel) {
      continue;
    }
    if (existing[existing.length - 1] !== displayLabel) {
      existing.push(displayLabel);
    }
    measureMap.set(measureIndex, existing);
  }

  const measureCount = Math.max(
    1,
    ...Array.from(measureMap.keys(), (index) => index + 1),
  );

  return Array.from({ length: measureCount }, (_, measureIndex) => ({
    measureIndex,
    labels: measureMap.get(measureIndex) ?? [],
  }));
}

function buildLeadSheetChordMeasureMapForLayout(
  chordEvents: LeadSheetChordEvent[],
  bpm: number,
  layout: MeasureLayoutConfig,
  keySignature?: string | null,
): Map<number, string[]> {
  const measureMap = new Map<number, string[]>();

  for (const chordEvent of chordEvents) {
    const startDivision = Math.max(0, secondsToDivisions(chordEvent.startTime, bpm));
    const measureIndex = getMeasureIndexForDivision(startDivision, layout);
    const existing = measureMap.get(measureIndex) ?? [];
    const displayLabel = formatLeadSheetChordLabel(chordEvent.chordName, keySignature);

    if (!displayLabel) {
      continue;
    }

    if (existing[existing.length - 1] !== displayLabel) {
      existing.push(displayLabel);
    }

    measureMap.set(measureIndex, existing);
  }

  return measureMap;
}

function buildPartMeasureXml(params: {
  measureCount: number;
  measureSegments: MeasureNoteSegment[];
  layout: MeasureLayoutConfig;
  divisionsPerMeasure: number;
  timeSignature: number;
  bpm: number;
  keyFifths: number;
  accidentalPreference: 'sharp' | 'flat' | null | undefined;
  clefSign: 'G' | 'F';
  clefLine: number;
  includeTempoDirection: boolean;
  includeChordDirections: boolean;
  chordMeasureMap: Map<number, string[]>;
}): string {
  const {
    measureCount,
    measureSegments,
    layout,
    divisionsPerMeasure,
    timeSignature,
    bpm,
    keyFifths,
    accidentalPreference,
    clefSign,
    clefLine,
    includeTempoDirection,
    includeChordDirections,
    chordMeasureMap,
  } = params;

  return Array.from({ length: measureCount }, (_, measureIndex) => {
    const segments = measureSegments
      .filter((segment) => segment.measureIndex === measureIndex)
      .sort((left, right) => left.startInMeasure - right.startInMeasure || left.pitch - right.pitch);
    const measureLength = getMeasureLengthDivisions(measureIndex, layout);
    const events = buildMeasureEventsWithMeter(segments, measureLength, timeSignature);
    const chordLabels = includeChordDirections
      ? chordMeasureMap.get(measureIndex) ?? []
      : [];
    const chordDirectionXml = chordLabels.length > 0
      ? (
        `<direction placement="below">`
        + `<direction-type><words default-y="-70" font-weight="bold" font-family="Varela Round, Nunito Sans, sans-serif">${escapeXml(chordLabels.join('  |  '))}</words></direction-type>`
        + `</direction>`
      )
      : '';

    const tempoDirectionXml = includeTempoDirection
      ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(bpm)}"/></direction>`
      : '';

    const attributesXml = measureIndex === 0
      ? (
        `<attributes>`
        + `<divisions>${DIVISIONS_PER_QUARTER}</divisions>`
        + `<key><fifths>${keyFifths}</fifths></key>`
        + `<time><beats>${timeSignature}</beats><beat-type>4</beat-type></time>`
        + `<clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>`
        + `</attributes>`
        + `${tempoDirectionXml}`
      )
      : '';

    const implicitMeasureAttribute = measureIndex === 0 && layout.firstMeasureDivisions < divisionsPerMeasure
      ? ' implicit="yes"'
      : '';

    return (
      `<measure number="${measureIndex + 1}"${implicitMeasureAttribute}>`
      + `${attributesXml}`
      + `${chordDirectionXml}`
      + `${events.map((event, index) => renderMeasureEvent(event, events, index, timeSignature, accidentalPreference)).join('')}`
      + `</measure>`
    );
  }).join('');
}

export function exportLeadSheetToMusicXml(
  noteEvents: SheetSageNoteEvent[],
  chordEvents: LeadSheetChordEvent[],
  options?: MusicXmlExportOptions,
): string {
  const bpm = options?.bpm ?? DEFAULT_BPM;
  const timeSignature = options?.timeSignature ?? 4;
  const title = options?.title?.trim();
  const keyFifths = getKeyFifths(options?.keySignature);
  const accidentalPreference = getAccidentalPreferenceFromKey(options?.keySignature);
  const enableLeadingSilenceAnacrusisSearch = options?.enableLeadingSilenceAnacrusisSearch ?? true;
  const divisionsPerMeasure = timeSignature * DIVISIONS_PER_QUARTER;
  const baseQuantizedNotes = quantizeNotes(noteEvents, bpm);
  const anacrusisSelection = resolveAnacrusisSelection({
    quantizedNotes: baseQuantizedNotes,
    timeSignature,
    enableSearch: enableLeadingSilenceAnacrusisSearch,
  });
  const anacrusisDivisions = anacrusisSelection.anacrusisDivisions;
  const anacrusisSeconds = Number(divisionsToSeconds(anacrusisDivisions, bpm).toFixed(6));
  const layout = anacrusisSelection.layout;
  const quantizedNotes = anacrusisSelection.quantizedNotes;

  const measureSegments = quantizedNotes.flatMap((note) => splitNoteAcrossMeasureLayout(note, layout));
  const chordMeasureMap = buildLeadSheetChordMeasureMapForLayout(
    chordEvents,
    bpm,
    layout,
    options?.keySignature,
  );

  let maxMeasureIndex = 0;

  for (const segment of measureSegments) {
    if (segment.measureIndex > maxMeasureIndex) {
      maxMeasureIndex = segment.measureIndex;
    }
  }

  for (const measureIndex of chordMeasureMap.keys()) {
    if (measureIndex > maxMeasureIndex) {
      maxMeasureIndex = measureIndex;
    }
  }

  const measureCount = Math.max(1, maxMeasureIndex + 1);
  const measureStartScoreTimes = Array.from({ length: measureCount }, (_, measureIndex) => (
    Number(divisionsToSeconds(getMeasureStartDivision(measureIndex, layout), bpm).toFixed(6))
  ));
  const measureStartAudioTimes = [...measureStartScoreTimes];
  const syncMetadata = JSON.stringify({
    version: 1,
    selectedAnacrusisDivisions: anacrusisDivisions,
    selectedAnacrusisSeconds: anacrusisSeconds,
    measureStartScoreTimes,
    measureStartAudioTimes,
  });

  const melodyMeasureXml = buildPartMeasureXml({
    measureCount,
    measureSegments,
    layout,
    divisionsPerMeasure,
    timeSignature,
    bpm,
    keyFifths,
    accidentalPreference,
    clefSign: 'G',
    clefLine: 2,
    includeTempoDirection: true,
    includeChordDirections: true,
    chordMeasureMap,
  });

  const partListXml = (
    `<score-part id="PMelody">`
    + `<part-name>Melody</part-name>`
    + `<score-instrument id="PMelody-I1"><instrument-name>Melody</instrument-name></score-instrument>`
    + `<midi-instrument id="PMelody-I1"><midi-channel>1</midi-channel><midi-program>41</midi-program></midi-instrument>`
    + `</score-part>`
  );

  const partsXml = `<part id="PMelody">${melodyMeasureXml}</part>`;

  const workXml = title ? `<work><work-title>${escapeXml(title)}</work-title></work>` : '';
  const movementXml = title ? `<movement-title>${escapeXml(title)}</movement-title>` : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
    + '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
    + `<!-- chordmini-sync-data:${syncMetadata} -->`
    + `<score-partwise version="3.1">`
    + `${workXml}`
    + `${movementXml}`
    + `<part-list>${partListXml}</part-list>`
    + `${partsXml}`
    + `</score-partwise>`
  );
}
