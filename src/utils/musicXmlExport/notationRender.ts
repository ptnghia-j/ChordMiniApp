import {
  GENERIC_MAX_VOICES_PER_STAFF,
  type NotationPartId,
  type RenderNoteType,
} from './constants';
import { buildMeasureEventsWithMeterGeneric } from './notationScore';
import {
  escapeXml,
  getGenericBeatGroupSize,
  pitchToMusicXml,
} from './shared';
import type {
  GenericMeasureEvent,
  NotationMeasure,
  NotationScore,
  NotationStaff,
} from './types';

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
    forceStemDirection?: 'up' | 'down';
  },
): string {
  const voice = options?.voice ?? 1;
  const staff = options?.staff ?? 1;
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
  const stemDirection = event.type === 'whole'
    ? null
    : (options?.forceStemDirection ?? overlappingVoiceStemDirection ?? getStemDirectionForPitches(event.pitches, staff, event.type));
  const stemXml = stemDirection ? `<stem>${stemDirection}</stem>` : '';

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

        return events.map((event, index) => renderGenericMeasureEvent(
          event,
          events,
          index,
          timeSignature,
          accidentalPreference,
          divisionsPerQuarter,
          {
            voice: voice.voice,
            staff: staff.staff,
            hideRests: voice.voice > 1,
            stemOverrideMap,
            forceStemDirection: multiVoiceStaffs.has(staff.staff)
              ? (voice.voice === 1 ? 'up' : 'down')
              : undefined,
          },
        )).join('');
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
}): string {
  const {
    score,
    partId,
    includeTempoDirection,
    includeChordDirections,
  } = params;

  return score.measures.map((measure) => {
    const isPickup = measure.measureIndex === 0
      && score.layout.firstMeasureDivisions < (score.timeSignature * score.divisionsPerQuarter);
    const isLastMeasure = measure.measureIndex === score.measures.length - 1;
    const previousMeasure = measure.measureIndex > 0
      ? score.measures[measure.measureIndex - 1]
      : null;
    const staves = partId === 'PMelody'
      ? (measure.melodyStaff ? [measure.melodyStaff] : [])
      : measure.pianoStaves;
    const chordDirectionXml = includeChordDirections && measure.chordDirections.length > 0
      ? (
        measure.chordDirections.map((direction) => (
          `<direction placement="above">`
          + `<direction-type><words default-y="50" font-weight="bold" font-family="Varela Round, Nunito Sans, sans-serif">${escapeXml(direction.label)}</words></direction-type>`
          + (direction.startDivision > 0 ? `<offset sound="no">${direction.startDivision}</offset>` : '')
          + `<staff>1</staff>`
          + `</direction>`
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

    return (
      `<measure number="${measure.measureIndex + 1}"${isPickup ? ' implicit="yes"' : ''}>`
      + `${attributesXml}`
      + `${chordDirectionXml}`
      + `${renderMeasureStreams(staves, measure, partId, score.timeSignature, measure.keyContext.accidentalPreference, score.divisionsPerQuarter)}`
      + `${isLastMeasure ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : ''}`
      + `</measure>`
    );
  }).join('');
}

export function renderNotationScoreToMusicXml(score: NotationScore): string {
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
  const partsXml = [
    score.includeMelody
      ? `<part id="PMelody">${buildPartMeasureXmlGeneric({ score, partId: 'PMelody', includeTempoDirection: true, includeChordDirections: true })}</part>`
      : '',
    `<part id="PPiano">${buildPartMeasureXmlGeneric({ score, partId: 'PPiano', includeTempoDirection: !score.includeMelody, includeChordDirections: !score.includeMelody })}</part>`,
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
