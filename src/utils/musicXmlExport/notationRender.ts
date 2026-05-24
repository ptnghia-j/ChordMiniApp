import {
  GENERIC_MAX_VOICES_PER_STAFF,
  type NotationPartId,
  type RenderNoteType,
} from './constants';
import { buildMeasureEventsWithMeterGeneric } from './notationScore';
import {
  escapeXml,
  getGenericBeatGroupSize,
  getWordsWithTimes,
  pitchToMusicXml,
  renderMusicXmlHarmony,
} from './shared';
import type { LyricsData } from '@/types/musicAiTypes';
import type {
  GenericMeasureEvent,
  NotationChord,
  NotationMeasure,
  NotationScore,
  NotationStaff,
} from './types';

type StemDirection = 'up' | 'down';

interface StemDirectionContext {
  staff: number;
  voice: number;
  startDivision: number;
  endDivision: number;
  pitchKey: string;
  direction: StemDirection;
}

function getChordLabelVisualWidth(label: string): number {
  const compactLabel = label.replace(/\s+/g, '');
  if (!compactLabel) {
    return 0;
  }

  const slashCount = (compactLabel.match(/\//g) ?? []).length;
  const accidentalCount = (compactLabel.match(/[♭♯]/g) ?? []).length;
  const parenCount = (compactLabel.match(/[()]/g) ?? []).length;

  return compactLabel.length + slashCount + accidentalCount + Math.ceil(parenCount / 2);
}

function getMeasureChordLabelLoad(measure: NotationMeasure): { chordCount: number; textUnits: number } {
  const chordCount = measure.chordDirections.length;
  const textUnits = measure.chordDirections.reduce(
    (sum, direction) => sum + Math.max(1, Math.ceil(getChordLabelVisualWidth(direction.label) / 3.5)),
    0,
  );

  return { chordCount, textUnits };
}

function getBoundaryChordCollisionRisk(
  previousMeasure: NotationMeasure | null | undefined,
  nextMeasure: NotationMeasure | null | undefined,
): number {
  const previousDirection = previousMeasure?.chordDirections.at(-1);
  const nextDirection = nextMeasure?.chordDirections[0];

  if (!previousMeasure || !nextMeasure || !previousDirection || !nextDirection) {
    return 0;
  }

  const previousStartRatio = previousDirection.startDivision / Math.max(1, previousMeasure.lengthDivisions);
  const nextStartRatio = nextDirection.startDivision / Math.max(1, nextMeasure.lengthDivisions);
  if (previousStartRatio < 0.45 || nextStartRatio > 0.15) {
    return 0;
  }

  let risk = getChordLabelVisualWidth(previousDirection.label) + getChordLabelVisualWidth(nextDirection.label);

  if (previousStartRatio >= 0.75) {
    risk += 2;
  } else if (previousStartRatio >= 0.5) {
    risk += 1;
  }

  if (nextStartRatio <= 0.01) {
    risk += 2;
  } else if (nextStartRatio <= 0.1) {
    risk += 1;
  }

  return risk;
}

function buildChordAwareSystemBreakIndexes(
  measures: NotationMeasure[],
  includeChordDirections: boolean,
): Set<number> {
  const breaks = new Set<number>();
  if (!includeChordDirections || measures.length <= 1) {
    return breaks;
  }

  let measuresInSystem = 0;
  let systemChordCount = 0;
  let systemTextUnits = 0;

  measures.forEach((measure, measureIndex) => {
    const { chordCount, textUnits } = getMeasureChordLabelLoad(measure);
    const boundaryCollisionRisk = getBoundaryChordCollisionRisk(
      measureIndex > 0 ? measures[measureIndex - 1] : null,
      measure,
    );
    const shouldBreakBeforeMeasure = measureIndex > 0 && (
      measuresInSystem >= 4
      || (
        measuresInSystem >= 3
        && (systemChordCount + chordCount > 6 || systemTextUnits + textUnits > 18)
      )
      || (
        measuresInSystem >= 2
        && (systemChordCount + chordCount > 7 || systemTextUnits + textUnits > 24)
      )
      || (
        boundaryCollisionRisk >= 7
      )
    );

    if (shouldBreakBeforeMeasure) {
      breaks.add(measureIndex);
      measuresInSystem = 0;
      systemChordCount = 0;
      systemTextUnits = 0;
    }

    measuresInSystem += 1;
    systemChordCount += chordCount;
    systemTextUnits += textUnits;
  });

  return breaks;
}

function getGenericBeamTag(
  events: GenericMeasureEvent[],
  index: number,
  level: 1 | 2,
  timeSignature: number,
  divisionsPerQuarter: number,
): string {
  const event = events[index];
  if (!event || event.kind !== 'chord') {
    return '';
  }

  const primaryEligibleTypes: RenderNoteType[] = ['eighth', '16th', '32nd'];
  const secondaryEligibleTypes: RenderNoteType[] = ['16th', '32nd'];
  const eligibleTypes = level === 1 ? primaryEligibleTypes : secondaryEligibleTypes;

  if (!eligibleTypes.includes(event.type)) {
    return '';
  }

  const beatGroupSize = getGenericBeatGroupSize(timeSignature, divisionsPerQuarter);
  const eventGroup = Math.floor(event.startInMeasure / beatGroupSize);
  const previous = events[index - 1];
  const next = events[index + 1];
  const previousEligible = previous?.kind === 'chord'
    && eligibleTypes.includes(previous.type)
    && Math.floor(previous.startInMeasure / beatGroupSize) === eventGroup;
  const nextEligible = next?.kind === 'chord'
    && eligibleTypes.includes(next.type)
    && Math.floor(next.startInMeasure / beatGroupSize) === eventGroup;

  if (level === 2) {
    const previousPrimaryEligible = previous?.kind === 'chord'
      && primaryEligibleTypes.includes(previous.type)
      && Math.floor(previous.startInMeasure / beatGroupSize) === eventGroup;
    const nextPrimaryEligible = next?.kind === 'chord'
      && primaryEligibleTypes.includes(next.type)
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

function getStaffMiddleLineMidi(staff: number): number {
  return staff === 2 ? 50 : 71;
}

function getStemDirectionForPitches(
  pitches: number[],
  staff: number,
  noteType: RenderNoteType,
): 'up' | 'down' | null {
  if (noteType === 'whole' || pitches.length === 0) {
    return null;
  }

  const lowestPitch = Math.min(...pitches);
  return lowestPitch < getStaffMiddleLineMidi(staff) ? 'up' : 'down';
}

function getMeasureStavesForPart(
  measure: NotationMeasure,
  partId: NotationPartId,
): NotationStaff[] {
  return partId === 'PMelody'
    ? (measure.melodyStaff ? [measure.melodyStaff] : [])
    : measure.pianoStaves;
}

function hasIndependentOverlappingLines(staff: NotationStaff): boolean {
  const chords = staff.voices
    .flatMap((voice) => voice.chords)
    .sort((left, right) => left.startDivision - right.startDivision || left.endDivision - right.endDivision);

  for (let leftIndex = 0; leftIndex < chords.length; leftIndex += 1) {
    const left = chords[leftIndex];

    for (let rightIndex = leftIndex + 1; rightIndex < chords.length; rightIndex += 1) {
      const right = chords[rightIndex];

      if (right.startDivision >= left.endDivision) {
        break;
      }

      const overlaps = left.startDivision < right.endDivision && right.startDivision < left.endDivision;
      const isSameChordAttack = left.startDivision === right.startDivision && left.endDivision === right.endDivision;
      if (overlaps && !isSameChordAttack) {
        return true;
      }
    }
  }

  return false;
}

function buildMultiLineStaffMeasureKeys(
  measures: NotationMeasure[],
  partId: NotationPartId,
): Set<string> {
  const seedKeys = new Set<string>();
  const notedKeys = new Set<string>();

  measures.forEach((measure) => {
    getMeasureStavesForPart(measure, partId).forEach((staff) => {
      const activeVoices = staff.voices.filter((voice) => voice.chords.length > 0);
      if (activeVoices.length > 0) {
        notedKeys.add(`${measure.measureIndex}:${staff.staff}`);
      }

      if (activeVoices.length > 1 || hasIndependentOverlappingLines(staff)) {
        seedKeys.add(`${measure.measureIndex}:${staff.staff}`);
      }
    });
  });

  const keys = new Set(seedKeys);
  seedKeys.forEach((key) => {
    const [measureIndexValue, staffValue] = key.split(':');
    const measureIndex = Number(measureIndexValue);
    const staff = Number(staffValue);

    [measureIndex - 1, measureIndex + 1].forEach((neighborMeasureIndex) => {
      const neighborKey = `${neighborMeasureIndex}:${staff}`;
      if (notedKeys.has(neighborKey)) {
        keys.add(neighborKey);
      }
    });
  });

  return keys;
}

function getStemPitchKey(pitches: number[]): string {
  return [...pitches].sort((left, right) => left - right).join(',');
}

function getAveragePitch(pitches: number[]): number {
  return pitches.length > 0
    ? pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length
    : Number.NEGATIVE_INFINITY;
}

function getHighestPitch(pitches: number[]): number {
  return pitches.length > 0 ? Math.max(...pitches) : Number.NEGATIVE_INFINITY;
}

function getLowestPitch(pitches: number[]): number {
  return pitches.length > 0 ? Math.min(...pitches) : Number.POSITIVE_INFINITY;
}

function compareChordPitchRole(
  left: NotationChord,
  right: NotationChord,
): number {
  const centerDelta = getAveragePitch(left.pitches) - getAveragePitch(right.pitches);
  if (Math.abs(centerDelta) > 0.5) {
    return centerDelta;
  }

  const highestDelta = getHighestPitch(left.pitches) - getHighestPitch(right.pitches);
  if (highestDelta !== 0) {
    return highestDelta;
  }

  return getLowestPitch(left.pitches) - getLowestPitch(right.pitches);
}

function chordsOverlap(left: NotationChord, right: NotationChord): boolean {
  return left.startDivision < right.endDivision && right.startDivision < left.endDivision;
}

function buildContextualStemDirectionContexts(
  staff: NotationStaff,
  hasMultiLineContext: boolean,
): StemDirectionContext[] {
  if (!hasMultiLineContext) {
    return [];
  }

  const chords = staff.voices.flatMap((voice) => voice.chords);
  if (chords.length < 2) {
    return [];
  }

  const voiceProfiles = [...staff.voices]
    .map((voice) => {
      const pitches = voice.chords.flatMap((chord) => chord.pitches);
      return {
        voice: voice.voice,
        noteCount: pitches.length,
        maxPitch: getHighestPitch(pitches),
        averagePitch: getAveragePitch(pitches),
      };
    })
    .filter((profile) => profile.noteCount > 0)
    .sort((left, right) => (
      right.maxPitch - left.maxPitch
      || right.averagePitch - left.averagePitch
      || right.noteCount - left.noteCount
      || left.voice - right.voice
    ));
  if (voiceProfiles.length < 2) {
    return [];
  }

  const upperVoice = voiceProfiles[0]?.voice;
  const lowerVoice = voiceProfiles[voiceProfiles.length - 1]?.voice;
  const getVoiceProfileDirection = (voice: number): StemDirection | undefined => {
    if (upperVoice !== undefined && voice === upperVoice) {
      return 'up';
    }

    if (lowerVoice !== undefined && voice === lowerVoice) {
      return 'down';
    }

    return undefined;
  };

  return chords.flatMap((chord): StemDirectionContext[] => {
    const overlappingChords = chords.filter((candidate) => (
      candidate !== chord && chordsOverlap(chord, candidate)
    ));
    let direction: StemDirection | undefined;

    if (overlappingChords.length > 0) {
      const orderedCluster = [chord, ...overlappingChords].sort(compareChordPitchRole);
      const lowestChord = orderedCluster[0];
      const highestChord = orderedCluster[orderedCluster.length - 1];

      if (highestChord === chord && compareChordPitchRole(chord, lowestChord) > 0) {
        direction = 'up';
      } else if (lowestChord === chord && compareChordPitchRole(chord, highestChord) < 0) {
        direction = 'down';
      } else {
        direction = getVoiceProfileDirection(chord.voice);
      }
    } else {
      direction = getVoiceProfileDirection(chord.voice);
    }

    if (!direction) {
      return [];
    }

    return [{
      staff: staff.staff,
      voice: chord.voice,
      startDivision: chord.startDivision,
      endDivision: chord.endDivision,
      pitchKey: getStemPitchKey(chord.pitches),
      direction,
    }];
  });
}

function findContextualStemDirection(
  event: GenericMeasureEvent,
  staff: number,
  voice: number,
  contexts: StemDirectionContext[] | undefined,
): StemDirection | undefined {
  if (event.kind !== 'chord' || !contexts?.length) {
    return undefined;
  }

  const pitchKey = getStemPitchKey(event.pitches);
  return contexts.find((context) => (
    context.staff === staff
    && context.voice === voice
    && context.pitchKey === pitchKey
    && event.startInMeasure >= context.startDivision
    && event.startInMeasure < context.endDivision
  ))?.direction;
}

function renderGenericNotationXml(params: {
  tieStart: boolean;
  tieStop: boolean;
  tupletStart?: boolean;
  tupletStop?: boolean;
}): string {
  const tieXml = [
    params.tieStop ? '<tie type="stop"/>' : '',
    params.tieStart ? '<tie type="start"/>' : '',
  ].join('');
  const notationContent = [
    params.tieStop ? '<tied type="stop"/>' : '',
    params.tieStart ? '<tied type="start"/>' : '',
    params.tupletStart ? '<tuplet type="start"/>' : '',
    params.tupletStop ? '<tuplet type="stop"/>' : '',
  ].join('');

  return notationContent ? `${tieXml}<notations>${notationContent}</notations>` : tieXml;
}

function renderGenericMeasureEvent(
  event: GenericMeasureEvent,
  events: GenericMeasureEvent[],
  index: number,
  timeSignature: number,
  accidentalPreference: 'sharp' | 'flat' | null | undefined,
  divisionsPerQuarter: number,
  options?: {
    voice?: number;
    staff?: number;
    hideRests?: boolean;
    stemOverrideMap?: Map<string, 'up' | 'down'>;
    stemDirectionContexts?: StemDirectionContext[];
    forceStemDirection?: 'up' | 'down';
    lyricText?: string;
  },
): string {
  const voice = options?.voice ?? 1;
  const staff = options?.staff ?? 1;
  const lyricText = options?.lyricText;
  const dotXml = '<dot/>'.repeat(event.dots);

  if (event.kind === 'rest') {
    if (options?.hideRests) {
      return `<forward><duration>${event.duration}</duration></forward>`;
    }

    return `<note><rest/><duration>${event.duration}</duration><voice>${voice}</voice><type>${event.type}</type>${dotXml}<staff>${staff}</staff></note>`;
  }

  const beamXml = `${getGenericBeamTag(events, index, 1, timeSignature, divisionsPerQuarter)}${getGenericBeamTag(events, index, 2, timeSignature, divisionsPerQuarter)}`;
  const timeModificationXml = event.timeModification
    ? `<time-modification><actual-notes>${event.timeModification.actualNotes}</actual-notes><normal-notes>${event.timeModification.normalNotes}</normal-notes></time-modification>`
    : '';
  const overlappingVoiceStemDirection = event.pitches
    .map((pitch) => options?.stemOverrideMap?.get(`${staff}:${event.startInMeasure}:${pitch}:${voice}`))
    .find((direction): direction is 'up' | 'down' => Boolean(direction));
  const contextualStemDirection = findContextualStemDirection(
    event,
    staff,
    voice,
    options?.stemDirectionContexts,
  );
  const stemDirection = event.type === 'whole'
    ? null
    : (
      contextualStemDirection
      ?? options?.forceStemDirection
      ?? overlappingVoiceStemDirection
      ?? getStemDirectionForPitches(event.pitches, staff, event.type)
    );
  const stemXml = stemDirection ? `<stem>${stemDirection}</stem>` : '';

  const lyricXml = lyricText ? `<lyric><syllabic>single</syllabic><text>${escapeXml(lyricText)}</text></lyric>` : '';

  return event.pitches.map((pitchValue, pitchIndex) => {
    const pitch = pitchToMusicXml(pitchValue, accidentalPreference, event.chordName);
    const alterXml = pitch.alter !== undefined ? `<alter>${pitch.alter}</alter>` : '';
    const chordXml = pitchIndex > 0 ? '<chord/>' : '';
    const notationXml = renderGenericNotationXml({
      tieStart: event.tieStart,
      tieStop: event.tieStop,
      tupletStart: pitchIndex === 0 ? event.tupletStart : undefined,
      tupletStop: pitchIndex === 0 ? event.tupletStop : undefined,
    });

    return (
      `<note>`
      + `${chordXml}`
      + `<pitch><step>${pitch.step}</step>${alterXml}<octave>${pitch.octave}</octave></pitch>`
      + `<duration>${event.duration}</duration>`
      + `${timeModificationXml}`
      + `<voice>${voice}</voice>`
      + `<type>${event.type}</type>`
      + `${dotXml}`
      + `${stemXml}`
      + `${pitchIndex === 0 ? beamXml : ''}`
      + `<staff>${staff}</staff>`
      + `${notationXml}`
      + `${pitchIndex === 0 ? lyricXml : ''}`
      + `</note>`
    );
  }).join('');
}

function renderMeasureStreams(
  staves: NotationStaff[],
  measure: NotationMeasure,
  partId: NotationPartId,
  timeSignature: number,
  accidentalPreference: 'sharp' | 'flat' | null | undefined,
  divisionsPerQuarter: number,
  multiLineStaffMeasureKeys: Set<string>,
  matchedLyrics?: Map<string, string>,
): string {
  const sharedPitchVoiceMap = new Map<string, Set<number>>();
  const multiVoiceStaffs = new Set<number>();

  staves.forEach((staff) => {
    const activeVoices = staff.voices.filter((voice) => voice.chords.length > 0);
    if (activeVoices.length > 1) {
      multiVoiceStaffs.add(staff.staff);
    }
  });

  staves.forEach((staff) => {
    staff.voices.forEach((voice) => {
      voice.chords.forEach((chord) => {
        chord.pitches.forEach((pitch) => {
          const key = `${staff.staff}:${chord.startDivision}:${pitch}`;
          const existing = sharedPitchVoiceMap.get(key) ?? new Set<number>();
          existing.add(voice.voice);
          sharedPitchVoiceMap.set(key, existing);
        });
      });
    });
  });

  const stemOverrideMap = new Map<string, 'up' | 'down'>();
  sharedPitchVoiceMap.forEach((voices, key) => {
    if (voices.size < 2) {
      return;
    }

    voices.forEach((voiceNumber) => {
      stemOverrideMap.set(`${key}:${voiceNumber}`, voiceNumber === 1 ? 'up' : 'down');
    });
  });

  const streams = staves.flatMap((staff) => {
    const voices = staff.voices.length > 0
      ? staff.voices
      : [{ voice: 1, staff: staff.staff, chords: [] }];
    const hasMultiLineContext = (
      multiVoiceStaffs.has(staff.staff)
      || multiLineStaffMeasureKeys.has(`${measure.measureIndex}:${staff.staff}`)
    );
    const stemDirectionContexts = buildContextualStemDirectionContexts(staff, hasMultiLineContext);

    return voices
      .filter((voice) => voice.voice <= GENERIC_MAX_VOICES_PER_STAFF)
      .map((voice) => {
        const resolvedPartId: NotationPartId = partId === 'PMelody' ? 'PMelody' : 'PPiano';
        const orderedChords = voice.chords
          .map((chord) => ({
            partId: resolvedPartId,
            measureIndex: measure.measureIndex,
            startInMeasure: chord.startDivision,
            duration: chord.endDivision - chord.startDivision,
            pitches: chord.pitches,
            chordName: chord.chordName,
            staff: chord.staff,
            voice: chord.voice,
            tieStart: chord.tieStart,
            tieStop: chord.tieStop,
            beatCarryDuration: 0,
            tuplet: chord.tuplet ?? null,
          }))
          .sort((left, right) => left.startInMeasure - right.startInMeasure || left.pitches[0] - right.pitches[0]);
        const events = buildMeasureEventsWithMeterGeneric(
          orderedChords,
          measure.lengthDivisions,
          timeSignature,
          divisionsPerQuarter,
        );

        return events.map((event, index) => {
          const lyricText = (event.kind === 'chord' && !event.tieStop && staff.staff === 1 && voice.voice === 1)
            ? matchedLyrics?.get(`${measure.measureIndex}:${event.startInMeasure}`)
            : undefined;

          return renderGenericMeasureEvent(
            event,
            events,
            index,
            timeSignature,
            accidentalPreference,
            divisionsPerQuarter,
            {
              voice: voice.voice,
              staff: staff.staff,
              hideRests: false,
              stemOverrideMap,
              stemDirectionContexts,
              forceStemDirection: hasMultiLineContext
                ? (voice.voice === 1 ? 'up' : 'down')
                : undefined,
              lyricText,
            },
          );
        }).join('');
      });
  });

  return streams.map((stream, index) => (
    stream + (index < streams.length - 1
      ? `<backup><duration>${measure.lengthDivisions}</duration></backup>`
      : '')
  )).join('');
}

function buildPartMeasureXmlGeneric(params: {
  score: NotationScore;
  partId: NotationPartId;
  includeTempoDirection: boolean;
  includeChordDirections: boolean;
  matchedLyrics?: Map<string, string>;
}): string {
  const {
    score,
    partId,
    includeTempoDirection,
    includeChordDirections,
    matchedLyrics,
  } = params;
  const systemBreakIndexes = buildChordAwareSystemBreakIndexes(score.measures, includeChordDirections);
  const multiLineStaffMeasureKeys = buildMultiLineStaffMeasureKeys(score.measures, partId);

  return score.measures.map((measure) => {
    const isPickup = measure.measureIndex === 0
      && score.layout.firstMeasureDivisions < (score.timeSignature * score.divisionsPerQuarter);
    const isLastMeasure = measure.measureIndex === score.measures.length - 1;
    const previousMeasure = measure.measureIndex > 0
      ? score.measures[measure.measureIndex - 1]
      : null;
    const staves = getMeasureStavesForPart(measure, partId);
    const chordDirectionXml = includeChordDirections && measure.chordDirections.length > 0
      ? (
        measure.chordDirections.map((direction) => (
          `${renderMusicXmlHarmony({
            chordName: direction.chordName,
            displayLabel: direction.label,
            preserveExactSpelling: true,
            keySignature: measure.keyContext.keySignature,
            defaultY: 50,
            startDivision: direction.startDivision,
            staff: 1,
          })}`
        )).join('')
      )
      : '';
    const tempoDirectionXml = includeTempoDirection
      ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(score.bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(score.bpm)}"/></direction>`
      : '';
    const shouldRenderKeySignature = measure.measureIndex === 0 || measure.keyContext.isKeyChange;
    const attributesXml = measure.measureIndex === 0
      ? (
        `<attributes>`
        + `<divisions>${score.divisionsPerQuarter}</divisions>`
        + `<key><fifths>${measure.keyContext.keyFifths}</fifths></key>`
        + `<time><beats>${score.timeSignature}</beats><beat-type>4</beat-type></time>`
        + (partId === 'PPiano'
          ? (
            `<staves>2</staves>`
            + `<clef number="1"><sign>G</sign><line>2</line></clef>`
            + `<clef number="2"><sign>F</sign><line>4</line></clef>`
          )
          : `<clef><sign>G</sign><line>2</line></clef>`)
        + `</attributes>`
        + `${tempoDirectionXml}`
      )
      : (shouldRenderKeySignature && previousMeasure
        ? `<attributes><key><fifths>${measure.keyContext.keyFifths}</fifths></key></attributes>`
        : '');
    const printXml = systemBreakIndexes.has(measure.measureIndex)
      ? '<print new-system="yes"/>'
      : '';

    return (
      `<measure number="${measure.measureIndex + 1}"${isPickup ? ' implicit="yes"' : ''}>`
      + `${printXml}`
      + `${attributesXml}`
      + `${chordDirectionXml}`
      + `${renderMeasureStreams(staves, measure, partId, score.timeSignature, measure.keyContext.accidentalPreference, score.divisionsPerQuarter, multiLineStaffMeasureKeys, matchedLyrics)}`
      + `${isLastMeasure ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : ''}`
      + `</measure>`
    );
  }).join('');
}

export function renderNotationScoreToMusicXml(score: NotationScore, lyrics?: LyricsData | null): string {
  const melodyPartListXml = score.includeMelody
    ? (
      `<score-part id="PMelody">`
      + `<part-name>Melody</part-name>`
      + `<score-instrument id="PMelody-I1"><instrument-name>Melody</instrument-name></score-instrument>`
      + `<midi-instrument id="PMelody-I1"><midi-channel>1</midi-channel><midi-program>41</midi-program></midi-instrument>`
      + `</score-part>`
    )
    : '';
  const pianoPartListXml = (
    `<score-part id="PPiano">`
    + `<part-name>Piano</part-name>`
    + `<part-abbreviation>Pno.</part-abbreviation>`
    + `<score-instrument id="PPiano-I1"><instrument-name>Acoustic Grand Piano</instrument-name></score-instrument>`
    + `<midi-instrument id="PPiano-I1"><midi-channel>${score.includeMelody ? 2 : 1}</midi-channel><midi-program>1</midi-program></midi-instrument>`
    + `</score-part>`
  );
  const primaryPartId = score.includeMelody ? 'PMelody' : 'PPiano';
  const primaryChords: Array<{ measureIndex: number; startInMeasure: number; audioTime: number }> = [];
  const secondsPerBeat = 60 / score.bpm;

  score.measures.forEach((measure) => {
    const measureStart = score.measureStartAudioTimes[measure.measureIndex] ?? 0;
    const staves = getMeasureStavesForPart(measure, primaryPartId);
    const staff1 = staves.find((s) => s.staff === 1);
    if (!staff1) return;
    const voice1 = staff1.voices.find((v) => v.voice === 1);
    if (!voice1) return;

    voice1.chords.forEach((chord) => {
      if (chord.tieStop) return;
      const beatOffset = chord.startDivision / score.divisionsPerQuarter;
      const audioTime = measureStart + beatOffset * secondsPerBeat;
      primaryChords.push({
        measureIndex: measure.measureIndex,
        startInMeasure: chord.startDivision,
        audioTime,
      });
    });
  });

  primaryChords.sort((a, b) => a.audioTime - b.audioTime);

  const matchedLyrics = new Map<string, string>();
  if (lyrics) {
    const words = getWordsWithTimes(lyrics);
    let chordIdx = 0;

    for (const word of words) {
      while (chordIdx < primaryChords.length && primaryChords[chordIdx].audioTime < word.startTime - 1.0) {
        chordIdx++;
      }

      let bestChordIdx = -1;
      let bestDiff = 1.0;
      let searchIdx = chordIdx;

      while (searchIdx < primaryChords.length && primaryChords[searchIdx].audioTime <= word.startTime + 1.0) {
        const diff = Math.abs(primaryChords[searchIdx].audioTime - word.startTime);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestChordIdx = searchIdx;
        }
        searchIdx++;
      }

      if (bestChordIdx !== -1) {
        const chord = primaryChords[bestChordIdx];
        const key = `${chord.measureIndex}:${chord.startInMeasure}`;
        const existing = matchedLyrics.get(key);
        matchedLyrics.set(key, existing ? `${existing} ${word.text}` : word.text);
        chordIdx = Math.max(chordIdx, bestChordIdx + 1);
      }
    }
  }

  const partsXml = [
    score.includeMelody
      ? `<part id="PMelody">${buildPartMeasureXmlGeneric({ score, partId: 'PMelody', includeTempoDirection: true, includeChordDirections: true, matchedLyrics })}</part>`
      : '',
    `<part id="PPiano">${buildPartMeasureXmlGeneric({ score, partId: 'PPiano', includeTempoDirection: !score.includeMelody, includeChordDirections: !score.includeMelody, matchedLyrics: score.includeMelody ? undefined : matchedLyrics })}</part>`,
  ].join('');
  const syncMetadata = JSON.stringify({
    version: 2,
    selectedAnacrusisDivisions: score.selectedAnacrusisDivisions,
    selectedAnacrusisSeconds: score.selectedAnacrusisSeconds,
    measureStartScoreTimes: score.measureStartScoreTimes,
    measureStartAudioTimes: score.measureStartAudioTimes,
  });
  const workXml = score.title ? `<work><work-title>${escapeXml(score.title)}</work-title></work>` : '';
  const movementXml = score.title ? `<movement-title>${escapeXml(score.title)}</movement-title>` : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
    + '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
    + `<!-- chordmini-sync-data:${syncMetadata} -->`
    + `<score-partwise version="3.1">`
    + `${workXml}`
    + `${movementXml}`
    + `<part-list>${melodyPartListXml}${pianoPartListXml}</part-list>`
    + `${partsXml}`
    + `</score-partwise>`
  );
}
