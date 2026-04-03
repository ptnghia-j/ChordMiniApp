import type { SheetSageNoteEvent } from '@/types/sheetSage';
import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';
import { getAccidentalPreferenceFromKey } from '@/utils/chordUtils';

const DIVISIONS_PER_QUARTER = 24;
const DEFAULT_BPM = 120;
const MIN_DIVISION = 6;

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
}

interface QuantizedNoteEvent {
  pitch: number;
  startDivision: number;
  endDivision: number;
}

interface MeasureNoteSegment {
  measureIndex: number;
  startInMeasure: number;
  duration: number;
  pitch: number;
  tieStart: boolean;
  tieStop: boolean;
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

function splitNoteAcrossMeasures(note: QuantizedNoteEvent, divisionsPerMeasure: number): MeasureNoteSegment[] {
  const segments: MeasureNoteSegment[] = [];
  let cursor = note.startDivision;

  while (cursor < note.endDivision) {
    const measureIndex = Math.floor(cursor / divisionsPerMeasure);
    const measureStart = measureIndex * divisionsPerMeasure;
    const measureEnd = measureStart + divisionsPerMeasure;
    const segmentEnd = Math.min(note.endDivision, measureEnd);

    segments.push({
      measureIndex,
      startInMeasure: cursor - measureStart,
      duration: Math.max(MIN_DIVISION, segmentEnd - cursor),
      pitch: note.pitch,
      tieStart: segmentEnd < note.endDivision,
      tieStop: cursor > note.startDivision,
    });

    cursor = segmentEnd;
  }

  return segments;
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
  let cursor = start;
  const orderedValues = [96, 72, 48, 36, 24, 18, 12, 6];

  while (remaining > 0) {
    const nextValue = orderedValues.find((value) => (
      value <= remaining
      && isDurationAllowedAtPosition(cursor, value, divisionsPerMeasure, timeSignature)
    )) ?? MIN_DIVISION;
    values.push(nextValue);
    remaining -= nextValue;
    cursor += nextValue;
  }

  return values;
}

function expandSegmentForMetricStructure(
  segment: MeasureNoteSegment,
  divisionsPerMeasure: number,
  timeSignature: number,
): MeasureEvent[] {
  const notationValues = splitDurationIntoNotationValues(
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
): string {
  const { type, dots } = getTypeInfo(event.duration);
  const dotXml = '<dot/>'.repeat(dots);

  if (event.kind === 'rest') {
    return `<note><rest/><duration>${event.duration}</duration><voice>1</voice><type>${type}</type>${dotXml}<staff>1</staff></note>`;
  }

  const pitch = pitchToMusicXml(event.pitch, accidentalPreference);
  const alterXml = pitch.alter !== undefined ? `<alter>${pitch.alter}</alter>` : '';
  const beamXml = `${getBeamTag(events, index, 1, timeSignature)}${getBeamTag(events, index, 2, timeSignature)}`;

  return (
    `<note>`
    + `<pitch><step>${pitch.step}</step>${alterXml}<octave>${pitch.octave}</octave></pitch>`
    + `<duration>${event.duration}</duration>`
    + `<voice>1</voice>`
    + `<type>${type}</type>`
    + `${dotXml}`
    + `${beamXml}`
    + `<staff>1</staff>`
    + `${renderTieNotation(event.tieStart, event.tieStop)}`
    + `</note>`
  );
}

function buildMeasureCount(
  noteEvents: SheetSageNoteEvent[],
  chordEvents: LeadSheetChordEvent[],
  measureDurationSeconds: number,
): number {
  const noteEnd = noteEvents.reduce((max, note) => Math.max(max, note.offset), 0);
  const chordEnd = chordEvents.reduce((max, chord) => Math.max(max, chord.endTime), 0);
  const totalDuration = Math.max(noteEnd, chordEnd, measureDurationSeconds);

  return Math.max(1, Math.ceil(totalDuration / measureDurationSeconds));
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
  const measureDurationSeconds = timeSignature * (60 / bpm);
  const divisionsPerMeasure = timeSignature * DIVISIONS_PER_QUARTER;
  const quantizedNotes = quantizeNotes(noteEvents, bpm);
  const measureCount = buildMeasureCount(noteEvents, chordEvents, measureDurationSeconds);
  const measureSegments = quantizedNotes.flatMap((note) => splitNoteAcrossMeasures(note, divisionsPerMeasure));
  const measureChords = buildLeadSheetMeasureChords(chordEvents, options);

  const measureXml = Array.from({ length: measureCount }, (_, measureIndex) => {
    const segments = measureSegments
      .filter((segment) => segment.measureIndex === measureIndex)
      .sort((left, right) => left.startInMeasure - right.startInMeasure || left.pitch - right.pitch);
    const events = buildMeasureEventsWithMeter(segments, divisionsPerMeasure, timeSignature);
    const chordLabels = measureChords[measureIndex]?.labels ?? [];
    const chordDirectionXml = chordLabels.length > 0
      ? (
        `<direction placement="below">`
        + `<direction-type><words default-y="-70" font-weight="bold" font-family="Varela Round, Nunito Sans, sans-serif">${escapeXml(chordLabels.join('  |  '))}</words></direction-type>`
        + `</direction>`
      )
      : '';

    const attributesXml = measureIndex === 0
      ? (
        `<attributes>`
        + `<divisions>${DIVISIONS_PER_QUARTER}</divisions>`
        + `<key><fifths>${keyFifths}</fifths></key>`
        + `<time><beats>${timeSignature}</beats><beat-type>4</beat-type></time>`
        + `<clef><sign>G</sign><line>2</line></clef>`
        + `</attributes>`
        + `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(bpm)}"/></direction>`
      )
      : '';

    return (
      `<measure number="${measureIndex + 1}">`
      + `${attributesXml}`
      + `${chordDirectionXml}`
      + `${events.map((event, index) => renderMeasureEvent(event, events, index, timeSignature, accidentalPreference)).join('')}`
      + `</measure>`
    );
  }).join('');

  const workXml = title ? `<work><work-title>${escapeXml(title)}</work-title></work>` : '';
  const movementXml = title ? `<movement-title>${escapeXml(title)}</movement-title>` : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
    + '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
    + `<score-partwise version="3.1">`
    + `${workXml}`
    + `${movementXml}`
    + `<part-list>`
    + `<score-part id="PMelody">`
    + `<part-name>Melody</part-name>`
    + `<score-instrument id="PMelody-I1"><instrument-name>Melody</instrument-name></score-instrument>`
    + `<midi-instrument id="PMelody-I1"><midi-channel>1</midi-channel><midi-program>41</midi-program></midi-instrument>`
    + `</score-part>`
    + `</part-list>`
    + `<part id="PMelody">${measureXml}</part>`
    + `</score-partwise>`
  );
}
