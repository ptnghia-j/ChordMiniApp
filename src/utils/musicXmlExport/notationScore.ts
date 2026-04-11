import { GENERIC_DIVISIONS_PER_QUARTER, type NotationPartId } from './constants';
import { beatPositionToSeconds } from './absoluteEvents';
import {
  buildGenericDurationMappings,
  getGenericTypeInfo,
} from './notationQuantization';
import {
  beatPositionToGenericDivisions,
  buildMeasureLayout,
  divisionsToGenericSeconds,
  fitsWithinGroup,
  formatLeadSheetChordLabel,
  getKeyAccidentalPreference,
  getKeyFifths,
  getMeasureIndexForDivision,
  getMeasureLengthDivisions,
  getMeasureStartDivision,
  isCompoundTime,
} from './shared';
import type {
  GenericMeasureChordSegment,
  GenericMeasureEvent,
  GenericMeasureNoteSegment,
  LeadSheetChordEvent,
  MeasureLayoutConfig,
  MusicXmlKeySection,
  NotationChord,
  NotationMeasure,
  NotationScore,
  NotationStaff,
  NotationVoice,
  QuantizedNotationNoteEvent,
  ResolvedScoreKeySection,
} from './types';

function buildGenericAnacrusisTransferCandidates(leadingSilenceDivisions: number, eighthDivision: number): number[] {
  const maxTransfer = Math.max(0, leadingSilenceDivisions);
  if (maxTransfer === 0) {
    return [0];
  }

  const candidates: number[] = [0];

  for (let candidate = eighthDivision; candidate <= maxTransfer; candidate += eighthDivision) {
    candidates.push(candidate);
  }

  if (candidates[candidates.length - 1] !== maxTransfer) {
    candidates.push(maxTransfer);
  }

  return [...new Set(candidates)].sort((left, right) => left - right);
}

function countGenericTieStartsForLayout(
  events: QuantizedNotationNoteEvent[],
  layout: MeasureLayoutConfig,
  timeSignature: number,
  divisionsPerQuarter: number,
): number {
  if (events.length === 0) {
    return 0;
  }

  const segments = groupMeasureSegmentsIntoChords(events.flatMap((event) => (
    splitQuantizedNoteAcrossLayout(event, layout, divisionsPerQuarter)
  )));
  const measureKeys = new Set<string>();

  segments.forEach((segment) => {
    measureKeys.add([
      segment.measureIndex,
      segment.partId,
      segment.staff,
      segment.voice,
    ].join(':'));
  });

  let tieStartCount = 0;

  measureKeys.forEach((key) => {
    const [measureIndexValue, partId, staffValue, voiceValue] = key.split(':');
    const measureIndex = Number(measureIndexValue);
    const staff = Number(staffValue);
    const voice = Number(voiceValue);
    const measureLength = getMeasureLengthDivisions(measureIndex, layout);
    const voiceSegments = segments
      .filter((segment) => (
        segment.measureIndex === measureIndex
        && segment.partId === partId
        && segment.staff === staff
        && segment.voice === voice
      ))
      .sort((left, right) => left.startInMeasure - right.startInMeasure || left.pitches[0] - right.pitches[0]);
    const measureEvents = buildMeasureEventsWithMeterGeneric(
      voiceSegments,
      measureLength,
      timeSignature,
      divisionsPerQuarter,
    );

    tieStartCount += measureEvents.filter((event) => event.kind === 'chord' && event.tieStart).length;
  });

  return tieStartCount;
}

function resolveGenericMeasureLayout(
  events: QuantizedNotationNoteEvent[],
  timeSignature: number,
  divisionsPerQuarter: number,
  enableSearch: boolean,
): { anacrusisDivisions: number; layout: MeasureLayoutConfig } {
  const divisionsPerMeasure = timeSignature * divisionsPerQuarter;

  if (!enableSearch || events.length === 0) {
    return {
      anacrusisDivisions: 0,
      layout: buildMeasureLayout(0, divisionsPerMeasure),
    };
  }

  const earliestStart = events.reduce((minimum, event) => Math.min(minimum, event.startDivision), Number.POSITIVE_INFINITY);
  const eighthDivision = Math.round(divisionsPerQuarter / 2);
  if (!Number.isFinite(earliestStart) || earliestStart < eighthDivision) {
    return {
      anacrusisDivisions: 0,
      layout: buildMeasureLayout(0, divisionsPerMeasure),
    };
  }

  type ScoredCandidate = {
    anacrusisDivisions: number;
    tieStartCount: number;
    firstNoteStartInMeasure: number;
    layout: MeasureLayoutConfig;
  };

  const candidates = buildGenericAnacrusisTransferCandidates(earliestStart, eighthDivision);
  const seenLayoutKeys = new Set<number>();
  let bestCandidate: ScoredCandidate | null = null;
  let bestAnacrusisCandidate: ScoredCandidate | null = null;

  const isBetterCandidate = (candidate: ScoredCandidate, incumbent: ScoredCandidate | null): boolean => {
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

  const isBetterAnacrusisCandidate = (candidate: ScoredCandidate, incumbent: ScoredCandidate | null): boolean => {
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

  for (const transferDivisions of candidates) {
    const layout = buildMeasureLayout(transferDivisions, divisionsPerMeasure);
    const anacrusisDivisions = layout.firstMeasureDivisions < divisionsPerMeasure
      ? layout.firstMeasureDivisions
      : 0;

    if (seenLayoutKeys.has(anacrusisDivisions)) {
      continue;
    }
    seenLayoutKeys.add(anacrusisDivisions);

    const firstNoteMeasureIndex = getMeasureIndexForDivision(earliestStart, layout);
    const firstNoteStartInMeasure = earliestStart - getMeasureStartDivision(firstNoteMeasureIndex, layout);
    const tieStartCount = countGenericTieStartsForLayout(events, layout, timeSignature, divisionsPerQuarter);
    const scoredCandidate: ScoredCandidate = {
      anacrusisDivisions,
      tieStartCount,
      firstNoteStartInMeasure,
      layout,
    };

    if (isBetterCandidate(scoredCandidate, bestCandidate)) {
      bestCandidate = scoredCandidate;
    }

    if (anacrusisDivisions > 0 && isBetterAnacrusisCandidate(scoredCandidate, bestAnacrusisCandidate)) {
      bestAnacrusisCandidate = scoredCandidate;
    }
  }

  if (!bestCandidate) {
    return {
      anacrusisDivisions: 0,
      layout: buildMeasureLayout(0, divisionsPerMeasure),
    };
  }

  let selectedCandidate = bestCandidate;

  if (selectedCandidate.anacrusisDivisions === 0 && bestAnacrusisCandidate) {
    const tieGap = bestAnacrusisCandidate.tieStartCount - selectedCandidate.tieStartCount;
    const firstNoteAlignmentGain = selectedCandidate.firstNoteStartInMeasure - bestAnacrusisCandidate.firstNoteStartInMeasure;
    const tieGapTolerance = Math.max(12, Math.ceil(selectedCandidate.tieStartCount * 0.06));
    const alignmentGainSteps = Math.max(0, Math.floor(firstNoteAlignmentGain / eighthDivision));
    const adaptiveTieGapTolerance = tieGapTolerance + Math.max(0, alignmentGainSteps - 1) * 6;
    const shouldPreferAnacrusis =
      firstNoteAlignmentGain >= eighthDivision
      && tieGap <= adaptiveTieGapTolerance;

    if (shouldPreferAnacrusis) {
      selectedCandidate = bestAnacrusisCandidate;
    }
  }

  return {
    anacrusisDivisions: selectedCandidate.anacrusisDivisions,
    layout: selectedCandidate.layout,
  };
}

function splitQuantizedNoteAcrossLayout(
  event: QuantizedNotationNoteEvent,
  layout: MeasureLayoutConfig,
  divisionsPerQuarter: number,
): GenericMeasureNoteSegment[] {
  const segments: GenericMeasureNoteSegment[] = [];
  let cursor = event.startDivision;

  while (cursor < event.endDivision) {
    const measureIndex = getMeasureIndexForDivision(cursor, layout);
    const measureStart = getMeasureStartDivision(measureIndex, layout);
    const measureEnd = measureStart + getMeasureLengthDivisions(measureIndex, layout);
    const segmentEnd = Math.min(event.endDivision, measureEnd);
    const elapsedBeforeSegment = cursor - event.startDivision;
    const beatProgress = ((elapsedBeforeSegment % divisionsPerQuarter) + divisionsPerQuarter) % divisionsPerQuarter;
    const beatCarryDuration = beatProgress === 0 ? 0 : divisionsPerQuarter - beatProgress;

    segments.push({
      partId: event.partId,
      measureIndex,
      startInMeasure: cursor - measureStart,
      duration: Math.max(1, segmentEnd - cursor),
      pitch: event.pitch,
      chordName: event.chordName,
      staff: event.staff,
      voice: event.voice,
      tieStart: segmentEnd < event.endDivision,
      tieStop: cursor > event.startDivision,
      beatCarryDuration,
      tuplet: segmentEnd < event.endDivision ? null : event.tuplet,
    });

    cursor = segmentEnd;
  }

  return segments;
}

function groupMeasureSegmentsIntoChords(
  segments: GenericMeasureNoteSegment[],
): GenericMeasureChordSegment[] {
  const grouped = new Map<string, GenericMeasureChordSegment>();

  for (const segment of segments) {
    const tupletKey = segment.tuplet
      ? `${segment.tuplet.startDivision}:${segment.tuplet.endDivision}:${segment.tuplet.index}:${segment.tuplet.count}`
      : 'none';
    const key = [
      segment.partId,
      segment.measureIndex,
      segment.startInMeasure,
      segment.duration,
      segment.chordName ?? '',
      segment.staff,
      segment.voice,
      segment.tieStart ? 1 : 0,
      segment.tieStop ? 1 : 0,
      segment.beatCarryDuration,
      tupletKey,
    ].join(':');
    const existing = grouped.get(key);

    if (existing) {
      existing.pitches.push(segment.pitch);
      continue;
    }

    grouped.set(key, {
      partId: segment.partId,
      measureIndex: segment.measureIndex,
      startInMeasure: segment.startInMeasure,
      duration: segment.duration,
      pitches: [segment.pitch],
      chordName: segment.chordName,
      staff: segment.staff,
      voice: segment.voice,
      tieStart: segment.tieStart,
      tieStop: segment.tieStop,
      beatCarryDuration: segment.beatCarryDuration,
      tuplet: segment.tuplet,
    });
  }

  return [...grouped.values()]
    .map((segment) => ({ ...segment, pitches: segment.pitches.sort((left, right) => left - right) }))
    .sort((left, right) => (
      left.measureIndex - right.measureIndex
      || left.staff - right.staff
      || left.voice - right.voice
      || left.startInMeasure - right.startInMeasure
      || left.pitches[0] - right.pitches[0]
    ));
}

function isDurationAllowedAtPositionGeneric(
  start: number,
  duration: number,
  divisionsPerMeasure: number,
  timeSignature: number,
  divisionsPerQuarter: number,
): boolean {
  if (start + duration > divisionsPerMeasure) {
    return false;
  }

  const compoundBeatSize = divisionsPerQuarter * 3;
  const halfMeasureSize = timeSignature === 4 ? divisionsPerMeasure / 2 : 0;

  switch (duration) {
    case divisionsPerQuarter * 4:
      return start === 0 && duration <= divisionsPerMeasure;
    case divisionsPerQuarter * 3:
      if (timeSignature === 3 && divisionsPerMeasure === divisionsPerQuarter * 3) {
        return start === 0;
      }
      return isCompoundTime(timeSignature) ? fitsWithinGroup(start, duration, compoundBeatSize) : false;
    case divisionsPerQuarter * 2:
      return halfMeasureSize > 0
        ? fitsWithinGroup(start, duration, halfMeasureSize)
        : fitsWithinGroup(start, duration, divisionsPerMeasure);
    case Math.round(divisionsPerQuarter * 1.5):
      return isCompoundTime(timeSignature) ? fitsWithinGroup(start, duration, compoundBeatSize) : false;
    case divisionsPerQuarter:
    case Math.round(divisionsPerQuarter * 0.75):
    case Math.round(divisionsPerQuarter * 0.5):
    case Math.round(divisionsPerQuarter * 0.375):
    case Math.round(divisionsPerQuarter * 0.25):
    case Math.round(divisionsPerQuarter * 0.125):
      return fitsWithinGroup(start, duration, divisionsPerQuarter);
    default:
      return false;
  }
}

function splitDurationIntoNotationValuesGeneric(
  start: number,
  duration: number,
  divisionsPerMeasure: number,
  timeSignature: number,
  divisionsPerQuarter: number,
): number[] {
  let remaining = duration;
  const values: number[] = [];
  const originStart = start;
  let cursor = start;
  const orderedValues = buildGenericDurationMappings(divisionsPerQuarter).map((mapping) => mapping.value);

  while (remaining > 0) {
    const nextValue = orderedValues.find((value) => (
      !(
        value === divisionsPerQuarter * 2
        && !isCompoundTime(timeSignature)
        && originStart % divisionsPerQuarter !== 0
      )
      && value <= remaining
      && isDurationAllowedAtPositionGeneric(cursor, value, divisionsPerMeasure, timeSignature, divisionsPerQuarter)
    )) ?? Math.min(remaining, Math.round(divisionsPerQuarter / 8));

    values.push(nextValue);
    remaining -= nextValue;
    cursor += nextValue;
  }

  return values;
}

function resolveCarryOverNotationValuesGeneric(
  segment: GenericMeasureChordSegment,
  divisionsPerMeasure: number,
  timeSignature: number,
  divisionsPerQuarter: number,
): number[] | null {
  if (
    segment.startInMeasure !== 0
    || !segment.tieStop
    || isCompoundTime(timeSignature)
  ) {
    return null;
  }

  const carryCandidates = [
    Math.round(divisionsPerQuarter * 0.25),
    Math.round(divisionsPerQuarter * 0.5),
    Math.round(divisionsPerQuarter * 0.75),
  ].filter((value) => value > 0);
  if (!carryCandidates.includes(segment.beatCarryDuration)) {
    return null;
  }

  if (
    segment.duration === divisionsPerMeasure
    && isDurationAllowedAtPositionGeneric(0, divisionsPerMeasure, divisionsPerMeasure, timeSignature, divisionsPerQuarter)
  ) {
    return [divisionsPerMeasure];
  }

  if (segment.duration < divisionsPerQuarter) {
    return null;
  }

  const values: number[] = [divisionsPerQuarter];
  const trailingDuration = segment.duration - divisionsPerQuarter;

  if (trailingDuration > 0) {
    const trailingValues = splitDurationIntoNotationValuesGeneric(
      divisionsPerQuarter,
      trailingDuration,
      divisionsPerMeasure,
      timeSignature,
      divisionsPerQuarter,
    );
    values.push(...trailingValues);
  }

  return values;
}

function expandChordSegmentForMetricStructure(
  segment: GenericMeasureChordSegment,
  divisionsPerMeasure: number,
  timeSignature: number,
  divisionsPerQuarter: number,
): GenericMeasureEvent[] {
  if (segment.tuplet) {
    return [{
      kind: 'chord',
      pitches: segment.pitches,
      chordName: segment.chordName,
      duration: segment.duration,
      startInMeasure: segment.startInMeasure,
      tieStart: segment.tieStart,
      tieStop: segment.tieStop,
      type: segment.tuplet.type,
      dots: 0,
      timeModification: {
        actualNotes: segment.tuplet.actualNotes,
        normalNotes: segment.tuplet.normalNotes,
      },
      tupletStart: segment.tuplet.index === 0,
      tupletStop: segment.tuplet.index === segment.tuplet.count - 1,
    }];
  }

  const carryOverValues = resolveCarryOverNotationValuesGeneric(
    segment,
    divisionsPerMeasure,
    timeSignature,
    divisionsPerQuarter,
  );
  const notationValues = carryOverValues ?? splitDurationIntoNotationValuesGeneric(
    segment.startInMeasure,
    segment.duration,
    divisionsPerMeasure,
    timeSignature,
    divisionsPerQuarter,
  );
  let cursor = segment.startInMeasure;

  return notationValues.map((value, index) => {
    const typeInfo = getGenericTypeInfo(value, divisionsPerQuarter);
    const isFirstFragment = index === 0;
    const isLastFragment = index === notationValues.length - 1;
    const event: GenericMeasureEvent = {
      kind: 'chord',
      pitches: segment.pitches,
      chordName: segment.chordName,
      duration: value,
      startInMeasure: cursor,
      tieStop: !isFirstFragment || segment.tieStop,
      tieStart: !isLastFragment || segment.tieStart,
      type: typeInfo.type,
      dots: typeInfo.dots,
    };
    cursor += value;
    return event;
  });
}

function buildRestEvents(
  startInMeasure: number,
  duration: number,
  divisionsPerMeasure: number,
  timeSignature: number,
  divisionsPerQuarter: number,
): GenericMeasureEvent[] {
  let cursor = startInMeasure;

  return splitDurationIntoNotationValuesGeneric(
    startInMeasure,
    duration,
    divisionsPerMeasure,
    timeSignature,
    divisionsPerQuarter,
  ).map((value) => {
    const typeInfo = getGenericTypeInfo(value, divisionsPerQuarter);
    const event: GenericMeasureEvent = {
      kind: 'rest',
      duration: value,
      startInMeasure: cursor,
      type: typeInfo.type,
      dots: typeInfo.dots,
    };
    cursor += value;
    return event;
  });
}

export function buildMeasureEventsWithMeterGeneric(
  segments: GenericMeasureChordSegment[],
  divisionsPerMeasure: number,
  timeSignature: number,
  divisionsPerQuarter: number,
): GenericMeasureEvent[] {
  if (segments.length === 0) {
    return buildRestEvents(0, divisionsPerMeasure, divisionsPerMeasure, timeSignature, divisionsPerQuarter);
  }

  const events: GenericMeasureEvent[] = [];
  let cursor = 0;

  for (const segment of segments) {
    if (segment.startInMeasure > cursor) {
      events.push(...buildRestEvents(
        cursor,
        segment.startInMeasure - cursor,
        divisionsPerMeasure,
        timeSignature,
        divisionsPerQuarter,
      ));
    }

    events.push(...expandChordSegmentForMetricStructure(
      segment,
      divisionsPerMeasure,
      timeSignature,
      divisionsPerQuarter,
    ));
    cursor = Math.max(cursor, segment.startInMeasure + segment.duration);
  }

  if (cursor < divisionsPerMeasure) {
    events.push(...buildRestEvents(
      cursor,
      divisionsPerMeasure - cursor,
      divisionsPerMeasure,
      timeSignature,
      divisionsPerQuarter,
    ));
  }

  return events;
}

function buildPitchSetKey(pitches: number[]): string {
  return pitches.join(',');
}

function pruneOrphanNotationChordTies(measures: NotationMeasure[]): void {
  const streams = new Map<string, Array<{
    chord: NotationChord;
    absoluteStart: number;
    absoluteEnd: number;
    pitchSetKey: string;
  }>>();

  const registerChord = (
    partId: NotationPartId,
    staff: number,
    voice: number,
    chord: NotationChord,
    measureStartDivision: number,
  ): void => {
    const key = `${partId}:${staff}:${voice}`;
    const list = streams.get(key) ?? [];
    list.push({
      chord,
      absoluteStart: measureStartDivision + chord.startDivision,
      absoluteEnd: measureStartDivision + chord.endDivision,
      pitchSetKey: buildPitchSetKey(chord.pitches),
    });
    streams.set(key, list);
  };

  measures.forEach((measure) => {
    if (measure.melodyStaff) {
      measure.melodyStaff.voices.forEach((voice) => {
        voice.chords.forEach((chord) => {
          registerChord('PMelody', measure.melodyStaff?.staff ?? 1, voice.voice, chord, measure.startDivision);
        });
      });
    }

    measure.pianoStaves.forEach((staff) => {
      staff.voices.forEach((voice) => {
        voice.chords.forEach((chord) => {
          registerChord('PPiano', staff.staff, voice.voice, chord, measure.startDivision);
        });
      });
    });
  });

  streams.forEach((stream) => {
    stream.sort((left, right) => (
      left.absoluteStart - right.absoluteStart
      || left.absoluteEnd - right.absoluteEnd
    ));

    for (let index = 0; index < stream.length; index += 1) {
      const current = stream[index];
      const previous = index > 0 ? stream[index - 1] : undefined;
      const next = index < stream.length - 1 ? stream[index + 1] : undefined;

      const hasMatchingPrevious = Boolean(
        previous
        && previous.absoluteEnd === current.absoluteStart
        && previous.pitchSetKey === current.pitchSetKey,
      );
      const hasMatchingNext = Boolean(
        next
        && current.absoluteEnd === next.absoluteStart
        && next.pitchSetKey === current.pitchSetKey,
      );

      if (current.chord.tieStop && !hasMatchingPrevious) {
        current.chord.tieStop = false;
      }

      if (current.chord.tieStart && !hasMatchingNext) {
        current.chord.tieStart = false;
      }
    }
  });
}

function resolveChordEventStartDivision(
  chordEvent: LeadSheetChordEvent,
  bpm: number,
  divisionsPerQuarter: number,
): number {
  if (Number.isFinite(chordEvent.beatIndex)) {
    return Math.max(0, beatPositionToGenericDivisions(chordEvent.beatIndex ?? 0, divisionsPerQuarter));
  }

  return Math.max(0, Math.round(chordEvent.startTime * (bpm / 60) * divisionsPerQuarter));
}

function normalizeScoreKeySections(
  keySections: MusicXmlKeySection[] | undefined,
  fallbackKeySignature: string | null | undefined,
  divisionsPerQuarter: number,
): ResolvedScoreKeySection[] {
  const rawSections = (keySections ?? [])
    .filter((section) => Number.isFinite(section.startBeatIndex))
    .map((section) => ({
      startBeatIndex: Math.max(0, Number(section.startBeatIndex)),
      keySignature: section.keySignature?.trim() ?? '',
    }))
    .filter((section) => section.keySignature.length > 0)
    .sort((left, right) => left.startBeatIndex - right.startBeatIndex);

  const resolved: ResolvedScoreKeySection[] = [];
  const appendSection = (startBeatIndex: number, keySignature: string | null | undefined): void => {
    const trimmedKeySignature = keySignature?.trim() ?? '';
    const normalizedKeySignature = trimmedKeySignature.length > 0 ? trimmedKeySignature : null;
    const nextSection: ResolvedScoreKeySection = {
      startBeatIndex: Math.max(0, Number(startBeatIndex) || 0),
      startDivision: Math.max(0, beatPositionToGenericDivisions(startBeatIndex, divisionsPerQuarter)),
      keySignature: normalizedKeySignature,
      keyFifths: getKeyFifths(normalizedKeySignature),
      accidentalPreference: getKeyAccidentalPreference(normalizedKeySignature),
    };
    const previousSection = resolved[resolved.length - 1];

    if (!previousSection) {
      resolved.push(nextSection);
      return;
    }

    if (previousSection.startDivision === nextSection.startDivision) {
      resolved[resolved.length - 1] = nextSection;
      return;
    }

    if (
      previousSection.keyFifths === nextSection.keyFifths
      && previousSection.accidentalPreference === nextSection.accidentalPreference
    ) {
      return;
    }

    resolved.push(nextSection);
  };

  const trimmedFallbackKeySignature = fallbackKeySignature?.trim() ?? '';
  const normalizedFallbackKeySignature = trimmedFallbackKeySignature.length > 0
    ? trimmedFallbackKeySignature
    : null;

  if (rawSections.length === 0) {
    appendSection(0, normalizedFallbackKeySignature);
    return resolved;
  }

  if (rawSections[0].startBeatIndex > 0) {
    appendSection(0, normalizedFallbackKeySignature ?? rawSections[0].keySignature);
  }

  rawSections.forEach((section) => {
    appendSection(section.startBeatIndex, section.keySignature);
  });

  if (resolved.length === 0) {
    appendSection(0, normalizedFallbackKeySignature);
  }

  return resolved;
}

function resolveScoreKeySectionForDivision(
  startDivision: number,
  keySections: ResolvedScoreKeySection[],
): ResolvedScoreKeySection {
  let resolvedSection = keySections[0] ?? {
    startBeatIndex: 0,
    startDivision: 0,
    keySignature: null,
    keyFifths: 0,
    accidentalPreference: undefined,
  };

  for (const section of keySections) {
    if (section.startDivision > startDivision) {
      break;
    }

    resolvedSection = section;
  }

  return resolvedSection;
}

function buildGenericChordMeasureMapForLayout(
  chordEvents: LeadSheetChordEvent[],
  bpm: number,
  layout: MeasureLayoutConfig,
  keySections: ResolvedScoreKeySection[],
  divisionsPerQuarter: number,
): Map<number, Array<{ label: string; chordName: string; startDivision: number }>> {
  const measureMap = new Map<number, Array<{ label: string; chordName: string; startDivision: number }>>();

  for (const chordEvent of chordEvents) {
    const startDivision = resolveChordEventStartDivision(chordEvent, bpm, divisionsPerQuarter);
    const measureIndex = getMeasureIndexForDivision(startDivision, layout);
    const measureStartDivision = getMeasureStartDivision(measureIndex, layout);
    const startInMeasure = Math.max(0, startDivision - measureStartDivision);
    const existing = measureMap.get(measureIndex) ?? [];
    const keySignature = resolveScoreKeySectionForDivision(startDivision, keySections).keySignature;
    const displayLabel = formatLeadSheetChordLabel(chordEvent.chordName, keySignature);

    if (!displayLabel) {
      continue;
    }

    const previous = existing[existing.length - 1];
    if (!previous || previous.label !== displayLabel || previous.startDivision !== startInMeasure) {
      existing.push({
        label: displayLabel,
        chordName: chordEvent.chordName,
        startDivision: startInMeasure,
      });
    }

    measureMap.set(measureIndex, existing);
  }

  return measureMap;
}

function createNotationStaff(
  staff: number,
  clefSign: 'G' | 'F',
  clefLine: number,
  voices: NotationVoice[],
): NotationStaff {
  return {
    staff,
    clefSign,
    clefLine,
    voices,
  };
}

export function buildNotationScore(params: {
  bpm: number;
  timeSignature: number;
  title?: string;
  keySignature?: string | null;
  keySections?: MusicXmlKeySection[];
  chordEvents: LeadSheetChordEvent[];
  beatTimes?: Array<number | null>;
  melodyNotes: QuantizedNotationNoteEvent[];
  pianoNotes: QuantizedNotationNoteEvent[];
  enableLeadingSilenceAnacrusisSearch: boolean;
  preferredLayout?: MeasureLayoutConfig;
  preferredAnacrusisDivisions?: number;
}): NotationScore {
  const divisionsPerQuarter = GENERIC_DIVISIONS_PER_QUARTER;
  const allNotes = [...params.melodyNotes, ...params.pianoNotes];
  const layoutSourceNotes = params.pianoNotes.length > 0
    ? params.pianoNotes
    : (params.melodyNotes.length > 0 ? params.melodyNotes : allNotes);
  const layoutSelection = params.preferredLayout
    ? {
        anacrusisDivisions: params.preferredAnacrusisDivisions ?? 0,
        layout: params.preferredLayout,
      }
    : resolveGenericMeasureLayout(
      layoutSourceNotes,
      params.timeSignature,
      divisionsPerQuarter,
      params.enableLeadingSilenceAnacrusisSearch,
    );
  const { anacrusisDivisions, layout } = layoutSelection;
  const allSegments = groupMeasureSegmentsIntoChords(allNotes.flatMap((event) => (
    splitQuantizedNoteAcrossLayout(event, layout, divisionsPerQuarter)
  )));
  const resolvedKeySections = normalizeScoreKeySections(
    params.keySections,
    params.keySignature,
    divisionsPerQuarter,
  );
  const chordMeasureMap = buildGenericChordMeasureMapForLayout(
    params.chordEvents,
    params.bpm,
    layout,
    resolvedKeySections,
    divisionsPerQuarter,
  );
  let maxMeasureIndex = 0;

  for (const segment of allSegments) {
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
  const measureStartDivisions = Array.from({ length: measureCount }, (_, measureIndex) => (
    getMeasureStartDivision(measureIndex, layout)
  ));
  const measureKeySections = measureStartDivisions.map((startDivision) => (
    resolveScoreKeySectionForDivision(startDivision, resolvedKeySections)
  ));
  const measures: NotationMeasure[] = Array.from({ length: measureCount }, (_, measureIndex) => {
    const measureLength = getMeasureLengthDivisions(measureIndex, layout);
    const startDivision = measureStartDivisions[measureIndex];
    const measureSegments = allSegments.filter((segment) => segment.measureIndex === measureIndex);
    const currentKeySection = measureKeySections[measureIndex];
    const previousKeySection = measureIndex > 0 ? measureKeySections[measureIndex - 1] : null;

    const melodyVoices = [1, 2]
      .map((voiceNumber) => {
        const chords = measureSegments
          .filter((segment) => segment.partId === 'PMelody' && segment.staff === 1 && segment.voice === voiceNumber)
          .map<NotationChord>((segment) => ({
            startDivision: segment.startInMeasure,
            endDivision: segment.startInMeasure + segment.duration,
            pitches: segment.pitches,
            chordName: segment.chordName,
            voice: voiceNumber,
            staff: 1,
            tieStart: segment.tieStart,
            tieStop: segment.tieStop,
            tuplet: segment.tuplet,
          }));
        return chords.length > 0 ? { voice: voiceNumber, staff: 1, chords } : null;
      })
      .filter((voice): voice is NotationVoice => voice !== null);

    const pianoStaves = [1, 2].map((staffNumber) => {
      const voices = [1, 2]
        .map((voiceNumber) => {
          const chords = measureSegments
            .filter((segment) => segment.partId === 'PPiano' && segment.staff === staffNumber && segment.voice === voiceNumber)
            .map<NotationChord>((segment) => ({
              startDivision: segment.startInMeasure,
              endDivision: segment.startInMeasure + segment.duration,
              pitches: segment.pitches,
              chordName: segment.chordName,
              voice: voiceNumber,
              staff: staffNumber,
              tieStart: segment.tieStart,
              tieStop: segment.tieStop,
              tuplet: segment.tuplet,
            }));
          return chords.length > 0 ? { voice: voiceNumber, staff: staffNumber, chords } : null;
        })
        .filter((voice): voice is NotationVoice => voice !== null);

      return createNotationStaff(
        staffNumber,
        staffNumber === 1 ? 'G' : 'F',
        staffNumber === 1 ? 2 : 4,
        voices,
      );
    });

    return {
      measureIndex,
      startDivision,
      lengthDivisions: measureLength,
      keyContext: {
        keySignature: currentKeySection.keySignature,
        keyFifths: currentKeySection.keyFifths,
        accidentalPreference: currentKeySection.accidentalPreference,
        isKeyChange: Boolean(
          previousKeySection
          && (
            previousKeySection.keyFifths !== currentKeySection.keyFifths
            || previousKeySection.accidentalPreference !== currentKeySection.accidentalPreference
          )
        ),
      },
      chordDirections: chordMeasureMap.get(measureIndex) ?? [],
      melodyStaff: params.melodyNotes.length > 0
        ? createNotationStaff(1, 'G', 2, melodyVoices)
        : null,
      pianoStaves,
    };
  });

  pruneOrphanNotationChordTies(measures);

  const measureStartScoreTimes = measures.map((measure) => (
    Number(divisionsToGenericSeconds(measure.startDivision, params.bpm, divisionsPerQuarter).toFixed(6))
  ));
  const measureStartAudioCandidates = new Map<number, number>();
  const registerMeasureStartCandidate = (measureIndex: number, candidateTime: number): void => {
    if (!Number.isFinite(candidateTime)) {
      return;
    }

    const existing = measureStartAudioCandidates.get(measureIndex);
    if (existing === undefined || candidateTime < existing) {
      measureStartAudioCandidates.set(measureIndex, candidateTime);
    }
  };

  if (params.beatTimes?.length) {
    measures.forEach((measure) => {
      const beatPosition = measure.startDivision / divisionsPerQuarter;
      const candidateTime = beatPositionToSeconds(beatPosition, params.beatTimes);
      if (candidateTime !== null) {
        registerMeasureStartCandidate(measure.measureIndex, candidateTime);
      }
    });
  }

  params.chordEvents.forEach((chordEvent) => {
    const startDivision = resolveChordEventStartDivision(chordEvent, params.bpm, divisionsPerQuarter);
    const measureIndex = getMeasureIndexForDivision(startDivision, layout);
    registerMeasureStartCandidate(measureIndex, chordEvent.startTime);
  });

  const measureStartAudioTimes = measureStartScoreTimes.map((scoreTime, measureIndex) => (
    Number((measureStartAudioCandidates.get(measureIndex) ?? scoreTime).toFixed(6))
  ));

  for (let measureIndex = 1; measureIndex < measureStartAudioTimes.length; measureIndex += 1) {
    if (measureStartAudioTimes[measureIndex] <= measureStartAudioTimes[measureIndex - 1]) {
      measureStartAudioTimes[measureIndex] = Number(
        Math.max(
          measureStartScoreTimes[measureIndex],
          measureStartAudioTimes[measureIndex - 1] + 0.000001,
        ).toFixed(6),
      );
    }
  }

  return {
    title: params.title,
    bpm: params.bpm,
    timeSignature: params.timeSignature,
    divisionsPerQuarter,
    layout,
    measures,
    keyFifths: measureKeySections[0]?.keyFifths ?? getKeyFifths(params.keySignature),
    accidentalPreference: measureKeySections[0]?.accidentalPreference ?? getKeyAccidentalPreference(params.keySignature),
    selectedAnacrusisDivisions: anacrusisDivisions,
    selectedAnacrusisSeconds: Number(divisionsToGenericSeconds(anacrusisDivisions, params.bpm, divisionsPerQuarter).toFixed(6)),
    measureStartScoreTimes,
    measureStartAudioTimes,
    includeMelody: params.melodyNotes.length > 0,
  };
}
