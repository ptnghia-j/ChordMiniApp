import type { SheetSageNoteEvent } from '@/types/sheetSage';

const DIVISIONS_PER_QUARTER = 48;
const DEFAULT_BPM = 120;
const MAX_VOICES_PER_STAFF = 2;
const MIN_PIANO_ARPEGGIO_DISPLAY_DURATION = 24;
const MAX_PIANO_ARPEGGIO_DISPLAY_DURATION = 48;
const MIN_NOTE_DIVISIONS = 6;
const ADAPTIVE_POSITION_STEPS = [48, 24, 16, 12, 8, 6] as const;
const ADAPTIVE_DURATION_VALUES = [192, 144, 96, 72, 48, 36, 32, 24, 18, 16, 12, 8, 6] as const;

const MUSICXML_PROGRAMS: Record<string, number> = {
  piano: 1,
  guitar: 25,
  violin: 41,
  flute: 74,
  bass: 34,
  melody: 41,
};

export interface ScoreNoteEvent {
  pitch: number;
  onset: number;
  offset: number;
}

export interface ScorePartData {
  id: string;
  name: string;
  instrumentName?: string;
  midiProgram?: number;
  notes: ScoreNoteEvent[];
}

export interface MusicXmlExportOptions {
  bpm?: number;
  timeSignature?: number;
  title?: string;
}

interface QuantizedNoteEvent {
  pitch: number;
  startDivision: number;
  endDivision: number;
}

interface NoteGroup {
  startDivision: number;
  endDivision: number;
  pitches: number[];
}

interface MeasureSegment {
  measureIndex: number;
  startInMeasure: number;
  duration: number;
  pitches: number[];
  tieStart: boolean;
  tieStop: boolean;
}

interface VoiceEvent {
  kind: 'rest' | 'note';
  duration: number;
  startInMeasure: number;
  pitches?: number[];
  tieStart?: boolean;
  tieStop?: boolean;
  beamGroupHint?: boolean;
}

interface StaffRenderConfig {
  staffNumber: number;
  clef: 'G' | 'F';
  groups: NoteGroup[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizePartId(value: string, fallbackIndex: number): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '');
  if (cleaned.length > 0) {
    return cleaned.startsWith('P') ? cleaned : `P${cleaned}`;
  }
  return `P${fallbackIndex + 1}`;
}

function secondsToDivisions(seconds: number, bpm: number): number {
  return Math.round(seconds * (bpm / 60) * DIVISIONS_PER_QUARTER);
}

function pitchToMusicXml(pitch: number): { step: string; alter?: number; octave: number } {
  const normalized = Math.max(0, Math.min(127, Math.round(pitch)));
  const octave = Math.floor(normalized / 12) - 1;
  const pitchClass = normalized % 12;

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

function getClefForPart(notes: ScoreNoteEvent[]): 'G' | 'F' {
  if (notes.length === 0) return 'G';
  const averagePitch = notes.reduce((sum, note) => sum + note.pitch, 0) / notes.length;
  return averagePitch < 58 ? 'F' : 'G';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function adaptiveQuantizePosition(rawDivision: number): number {
  let bestDivision = Math.max(0, Math.round(rawDivision / MIN_NOTE_DIVISIONS) * MIN_NOTE_DIVISIONS);
  let bestScore = Number.POSITIVE_INFINITY;

  for (const step of ADAPTIVE_POSITION_STEPS) {
    const candidate = Math.max(0, Math.round(rawDivision / step) * step);
    const distance = Math.abs(rawDivision - candidate);
    const score = distance + ((48 / step) * 0.18);

    if (score < bestScore || (score === bestScore && step > MIN_NOTE_DIVISIONS)) {
      bestScore = score;
      bestDivision = candidate;
    }
  }

  return bestDivision;
}

function adaptiveQuantizeDuration(rawDuration: number): number {
  let bestDuration = MIN_NOTE_DIVISIONS;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of ADAPTIVE_DURATION_VALUES) {
    const distance = Math.abs(rawDuration - candidate);
    const score = distance + ((48 / candidate) * 0.14);

    if (score < bestScore) {
      bestScore = score;
      bestDuration = candidate;
    }
  }

  return Math.max(MIN_NOTE_DIVISIONS, bestDuration);
}

function quantizeNotes(notes: ScoreNoteEvent[], bpm: number): QuantizedNoteEvent[] {
  return notes
    .map((note) => {
      const rawStartDivision = Math.max(0, secondsToDivisions(note.onset, bpm));
      const rawEndDivision = Math.max(rawStartDivision + 1, secondsToDivisions(note.offset, bpm));
      const startDivision = adaptiveQuantizePosition(rawStartDivision);
      const quantizedEnd = adaptiveQuantizePosition(rawEndDivision);
      const adaptiveDuration = adaptiveQuantizeDuration(rawEndDivision - rawStartDivision);
      const endDivision = Math.max(startDivision + MIN_NOTE_DIVISIONS, quantizedEnd, startDivision + adaptiveDuration);

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

function cleanQuantizedNotes(notes: QuantizedNoteEvent[]): QuantizedNoteEvent[] {
  const byPitch = new Map<number, QuantizedNoteEvent[]>();

  for (const note of notes) {
    const list = byPitch.get(note.pitch);
    if (list) {
      list.push({ ...note });
    } else {
      byPitch.set(note.pitch, [{ ...note }]);
    }
  }

  const cleaned: QuantizedNoteEvent[] = [];

  for (const pitchNotes of byPitch.values()) {
    pitchNotes.sort((left, right) => (
      left.startDivision - right.startDivision
      || left.endDivision - right.endDivision
    ));

    const deduped: QuantizedNoteEvent[] = [];

    for (const note of pitchNotes) {
      const previous = deduped[deduped.length - 1];

      if (!previous) {
        deduped.push(note);
        continue;
      }

      if (note.startDivision === previous.startDivision) {
        previous.endDivision = Math.max(previous.endDivision, note.endDivision);
        continue;
      }

      if (note.startDivision < previous.endDivision) {
        previous.endDivision = Math.max(previous.startDivision + MIN_NOTE_DIVISIONS, note.startDivision);
      }

      if (previous.endDivision > previous.startDivision) {
        deduped[deduped.length - 1] = previous;
      } else {
        deduped.pop();
      }

      deduped.push(note);
    }

    for (const note of deduped) {
      if (note.endDivision - note.startDivision >= MIN_NOTE_DIVISIONS) {
        cleaned.push(note);
      }
    }
  }

  return cleaned.sort((left, right) => (
    left.startDivision - right.startDivision
    || left.endDivision - right.endDivision
    || left.pitch - right.pitch
  ));
}

function groupSimultaneousNotes(notes: QuantizedNoteEvent[]): NoteGroup[] {
  const grouped = new Map<string, NoteGroup>();

  for (const note of notes) {
    const key = `${note.startDivision}:${note.endDivision}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.pitches.push(note.pitch);
    } else {
      grouped.set(key, {
        startDivision: note.startDivision,
        endDivision: note.endDivision,
        pitches: [note.pitch],
      });
    }
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      pitches: group.pitches.sort((left, right) => left - right),
    }))
    .sort((left, right) => (
      left.startDivision - right.startDivision
      || left.endDivision - right.endDivision
      || left.pitches[0] - right.pitches[0]
    ));
}

function simplifyGroupsForDisplay(part: ScorePartData, groups: NoteGroup[]): NoteGroup[] {
  if (part.instrumentName?.toLowerCase() !== 'piano') {
    return groups;
  }

  return groups.map((group, index) => {
    if (group.pitches.length > 1) {
      return group;
    }

    const nextGroup = groups[index + 1];
    const nextStart = nextGroup?.startDivision;
    const nextBeatBoundary = (Math.floor(group.startDivision / DIVISIONS_PER_QUARTER) + 1) * DIVISIONS_PER_QUARTER;
    const targetEnd = Math.max(
      group.startDivision + MIN_PIANO_ARPEGGIO_DISPLAY_DURATION,
      nextBeatBoundary,
      nextStart ?? 0,
    );

    return {
      ...group,
      endDivision: Math.min(
        Math.max(group.startDivision + MIN_NOTE_DIVISIONS, targetEnd),
        group.startDivision + MAX_PIANO_ARPEGGIO_DISPLAY_DURATION,
        group.endDivision,
      ),
    };
  });
}

function computePianoSplitPitch(groups: NoteGroup[]): number {
  const allPitches = groups.flatMap((group) => group.pitches).sort((left, right) => left - right);

  if (allPitches.length === 0) {
    return 60;
  }

  const medianPitch = allPitches[Math.floor(allPitches.length / 2)];
  return clamp(medianPitch, 55, 64);
}

function splitPianoGroupsToStaves(groups: NoteGroup[]): StaffRenderConfig[] {
  const splitPitch = computePianoSplitPitch(groups);
  const trebleGroups: NoteGroup[] = [];
  const bassGroups: NoteGroup[] = [];

  let previousTreblePitch = Math.max(64, splitPitch + 3);
  let previousBassPitch = Math.min(52, splitPitch - 5);

  for (const group of groups) {
    const sortedPitches = [...group.pitches].sort((left, right) => left - right);
    let upperPitches = sortedPitches.filter((pitch) => pitch >= splitPitch + 1);
    let lowerPitches = sortedPitches.filter((pitch) => pitch < splitPitch + 1);

    if (upperPitches.length === 0 || lowerPitches.length === 0) {
      const centerPitch = sortedPitches.reduce((sum, pitch) => sum + pitch, 0) / sortedPitches.length;
      const trebleDistance = Math.abs(centerPitch - previousTreblePitch);
      const bassDistance = Math.abs(centerPitch - previousBassPitch);
      const assignToTreble = centerPitch >= splitPitch || trebleDistance <= bassDistance;

      if (assignToTreble) {
        upperPitches = sortedPitches;
        lowerPitches = [];
      } else {
        upperPitches = [];
        lowerPitches = sortedPitches;
      }
    }

    if (upperPitches.length > 0) {
      trebleGroups.push({
        startDivision: group.startDivision,
        endDivision: group.endDivision,
        pitches: upperPitches,
      });
      previousTreblePitch = upperPitches[upperPitches.length - 1];
    }

    if (lowerPitches.length > 0) {
      bassGroups.push({
        startDivision: group.startDivision,
        endDivision: group.endDivision,
        pitches: lowerPitches,
      });
      previousBassPitch = lowerPitches[0];
    }
  }

  return [
    {
      staffNumber: 1,
      clef: 'G',
      groups: trebleGroups,
    },
    {
      staffNumber: 2,
      clef: 'F',
      groups: bassGroups,
    },
  ];
}

function buildStaffConfigsForPart(part: ScorePartData, bpm: number): StaffRenderConfig[] {
  const cleanedNotes = cleanQuantizedNotes(quantizeNotes(part.notes, bpm));
  const groupedNotes = groupSimultaneousNotes(cleanedNotes);
  const instrumentName = part.instrumentName?.toLowerCase();

  if (instrumentName === 'piano') {
    return splitPianoGroupsToStaves(groupedNotes).map((staffConfig) => ({
      ...staffConfig,
      groups: simplifyGroupsForDisplay(part, staffConfig.groups),
    }));
  }

  return [
    {
      staffNumber: 1,
      clef: getClefForPart(part.notes),
      groups: groupedNotes,
    },
  ];
}

function assignGroupsToVoices(groups: NoteGroup[], maxVoices: number): NoteGroup[][] {
  const voices: Array<{ endDivision: number; groups: NoteGroup[] }> = [];

  for (const group of groups) {
    const voiceIndex = voices.findIndex((voice) => voice.endDivision <= group.startDivision);

    if (voiceIndex >= 0) {
      voices[voiceIndex].groups.push(group);
      voices[voiceIndex].endDivision = group.endDivision;
      continue;
    }

    if (voices.length < maxVoices) {
      voices.push({
        endDivision: group.endDivision,
        groups: [group],
      });
      continue;
    }

    let earliestEndingVoice = 0;
    for (let index = 1; index < voices.length; index += 1) {
      if (voices[index].endDivision < voices[earliestEndingVoice].endDivision) {
        earliestEndingVoice = index;
      }
    }

    voices[earliestEndingVoice].groups.push(group);
    voices[earliestEndingVoice].endDivision = Math.max(voices[earliestEndingVoice].endDivision, group.endDivision);
  }

  return voices.map((voice) => voice.groups);
}

function splitGroupAcrossMeasures(group: NoteGroup, divisionsPerMeasure: number): MeasureSegment[] {
  const segments: MeasureSegment[] = [];
  let cursor = group.startDivision;
  const finalEnd = group.endDivision;

  while (cursor < finalEnd) {
    const measureIndex = Math.floor(cursor / divisionsPerMeasure);
    const measureStart = measureIndex * divisionsPerMeasure;
    const measureEnd = measureStart + divisionsPerMeasure;
    const segmentEnd = Math.min(finalEnd, measureEnd);

    segments.push({
      measureIndex,
      startInMeasure: cursor - measureStart,
      duration: Math.max(1, segmentEnd - cursor),
      pitches: group.pitches,
      tieStart: segmentEnd < finalEnd,
      tieStop: cursor > group.startDivision,
    });

    cursor = segmentEnd;
  }

  return segments;
}

function buildVoiceMeasureEvents(
  segments: MeasureSegment[],
  divisionsPerMeasure: number,
  absorbFollowingRests = false,
): VoiceEvent[] {
  if (segments.length === 0) {
    return [{ kind: 'rest', duration: divisionsPerMeasure, startInMeasure: 0 }];
  }

  const events: VoiceEvent[] = [];
  let cursor = 0;

  for (const segment of segments) {
    if (segment.startInMeasure > cursor) {
      events.push({
        kind: 'rest',
        duration: segment.startInMeasure - cursor,
        startInMeasure: cursor,
      });
    }

    events.push({
      kind: 'note',
      duration: segment.duration,
      startInMeasure: segment.startInMeasure,
      pitches: segment.pitches,
      tieStart: segment.tieStart,
      tieStop: segment.tieStop,
    });

    cursor = segment.startInMeasure + segment.duration;
  }

  if (cursor < divisionsPerMeasure) {
    events.push({
      kind: 'rest',
      duration: divisionsPerMeasure - cursor,
      startInMeasure: cursor,
    });
  }

  if (!absorbFollowingRests) {
    return events;
  }

  const condensedEvents: VoiceEvent[] = [];

  for (const event of events) {
    const previous = condensedEvents[condensedEvents.length - 1];

    if (event.kind === 'rest' && previous?.kind === 'note') {
      previous.duration += event.duration;
      if (!previous.tieStart) {
        previous.tieStart = false;
      }
      continue;
    }

    condensedEvents.push({ ...event });
  }

  return condensedEvents;
}

function getTypeInfo(duration: number): {
  type: 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd';
  dots?: number;
  actualNotes?: number;
  normalNotes?: number;
} {
  const mappings = [
    { duration: 192, type: 'whole' as const },
    { duration: 144, type: 'half' as const, dots: 1 },
    { duration: 96, type: 'half' as const },
    { duration: 72, type: 'quarter' as const, dots: 1 },
    { duration: 48, type: 'quarter' as const },
    { duration: 36, type: 'eighth' as const, dots: 1 },
    { duration: 32, type: 'quarter' as const, actualNotes: 3, normalNotes: 2 },
    { duration: 24, type: 'eighth' as const },
    { duration: 18, type: '16th' as const, dots: 1 },
    { duration: 16, type: 'eighth' as const, actualNotes: 3, normalNotes: 2 },
    { duration: 12, type: '16th' as const },
    { duration: 8, type: '16th' as const, actualNotes: 3, normalNotes: 2 },
    { duration: 6, type: '32nd' as const },
  ];

  let bestMatch = mappings[0];
  let bestDistance = Math.abs(duration - bestMatch.duration);

  for (let index = 1; index < mappings.length; index += 1) {
    const candidate = mappings[index];
    const distance = Math.abs(duration - candidate.duration);
    if (distance < bestDistance) {
      bestMatch = candidate;
      bestDistance = distance;
    }
  }

  return {
    type: bestMatch.type,
    dots: bestMatch.dots,
    actualNotes: bestMatch.actualNotes,
    normalNotes: bestMatch.normalNotes,
  };
}

function splitDottedEventForNotation(event: VoiceEvent): VoiceEvent[] {
  if (event.kind !== 'note') {
    return [event];
  }

  if (event.duration === 36) {
    return [
      {
        ...event,
        duration: 24,
        tieStart: true,
        beamGroupHint: true,
      },
      {
        ...event,
        duration: 12,
        startInMeasure: event.startInMeasure + 24,
        tieStop: true,
        tieStart: false,
        beamGroupHint: true,
      },
    ];
  }

  if (event.duration === 18) {
    return [
      {
        ...event,
        duration: 12,
        tieStart: true,
        beamGroupHint: true,
      },
      {
        ...event,
        duration: 6,
        startInMeasure: event.startInMeasure + 12,
        tieStop: true,
        tieStart: false,
        beamGroupHint: true,
      },
    ];
  }

  return [event];
}

function expandEventsForNotation(events: VoiceEvent[]): VoiceEvent[] {
  return events.flatMap((event) => splitDottedEventForNotation(event));
}

function renderTieNotation(tieStart: boolean, tieStop: boolean): string {
  if (!tieStart && !tieStop) {
    return '';
  }

  const ties = [
    tieStop ? '<tie type="stop"/>' : '',
    tieStart ? '<tie type="start"/>' : '',
  ].join('');
  const notations = [
    tieStop ? '<tied type="stop"/>' : '',
    tieStart ? '<tied type="start"/>' : '',
  ].join('');

  return `${ties}<notations>${notations}</notations>`;
}

function getBeamTag(
  events: VoiceEvent[],
  index: number,
  level: 1 | 2,
  _timeSignature: number,
): string {
  const event = events[index];
  if (!event || event.kind !== 'note') {
    return '';
  }

  if (!event.beamGroupHint && event.duration > 24) {
    return '';
  }

  const maxDuration = level === 1 ? 24 : 12;
  if (event.duration > maxDuration) {
    return '';
  }

  const beatSpan = DIVISIONS_PER_QUARTER;
  const eventGroup = Math.floor(event.startInMeasure / beatSpan);

  const previous = events[index - 1];
  const previousEligible = previous?.kind === 'note'
    && previous.duration <= maxDuration
    && Math.floor(previous.startInMeasure / beatSpan) === eventGroup;

  const next = events[index + 1];
  const nextEligible = next?.kind === 'note'
    && next.duration <= maxDuration
    && Math.floor(next.startInMeasure / beatSpan) === eventGroup;

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

function renderVoiceEvent(
  event: VoiceEvent,
  events: VoiceEvent[],
  eventIndex: number,
  voiceIndex: number,
  staffNumber: number,
  timeSignature: number,
): string {
  const { type, dots, actualNotes, normalNotes } = getTypeInfo(event.duration);
  const dotXml = dots ? '<dot/>' : '';
  const tupletXml = actualNotes && normalNotes
    ? `<time-modification><actual-notes>${actualNotes}</actual-notes><normal-notes>${normalNotes}</normal-notes></time-modification>`
    : '';
  const beamXml = event.kind === 'note'
    ? `${getBeamTag(events, eventIndex, 1, timeSignature)}${getBeamTag(events, eventIndex, 2, timeSignature)}`
    : '';

  if (event.kind === 'rest') {
    return `<note><rest/><duration>${event.duration}</duration><voice>${voiceIndex}</voice><type>${type}</type>${dotXml}${tupletXml}<staff>${staffNumber}</staff></note>`;
  }

  const pitches = event.pitches ?? [];
  return pitches.map((pitch, index) => {
    const pitchData = pitchToMusicXml(pitch);
    const alterXml = pitchData.alter !== undefined ? `<alter>${pitchData.alter}</alter>` : '';
    const chordXml = index > 0 ? '<chord/>' : '';
    const tieXml = renderTieNotation(Boolean(event.tieStart), Boolean(event.tieStop));

    return (
      `<note>`
      + `${chordXml}`
      + `<pitch><step>${pitchData.step}</step>${alterXml}<octave>${pitchData.octave}</octave></pitch>`
      + `<duration>${event.duration}</duration>`
      + `<voice>${voiceIndex}</voice>`
      + `<type>${type}</type>`
      + `${dotXml}`
      + `${tupletXml}`
      + `${beamXml}`
      + `<staff>${staffNumber}</staff>`
      + `${tieXml}`
      + `</note>`
    );
  }).join('');
}

function buildPartXml(
  part: ScorePartData,
  partIndex: number,
  bpm: number,
  timeSignature: number,
  measureCount: number,
): string {
  const divisionsPerMeasure = timeSignature * DIVISIONS_PER_QUARTER;
  const staffConfigs = buildStaffConfigsForPart(part, bpm);
  const absorbFollowingRests = part.instrumentName?.toLowerCase() === 'piano';
  const staffVoiceGroups = staffConfigs.map((staffConfig) => {
    return {
      ...staffConfig,
      voices: assignGroupsToVoices(staffConfig.groups, MAX_VOICES_PER_STAFF),
    };
  });

  const measureXml = Array.from({ length: Math.max(1, measureCount) }, (_, measureIndex) => {
    const voiceXml = staffVoiceGroups.flatMap((staffConfig, staffIndex) => {
      const renderedStaffVoices = staffConfig.voices.map((voiceGroups, voiceArrayIndex) => {
        const measureSegments = voiceGroups
          .flatMap((group) => splitGroupAcrossMeasures(group, divisionsPerMeasure))
          .filter((segment) => segment.measureIndex === measureIndex)
          .sort((left, right) => left.startInMeasure - right.startInMeasure);

        if (measureSegments.length === 0) {
          return null;
        }

        const events = expandEventsForNotation(
          buildVoiceMeasureEvents(measureSegments, divisionsPerMeasure, absorbFollowingRests),
        );
        const backupXml = voiceArrayIndex > 0
          ? `<backup><duration>${divisionsPerMeasure}</duration></backup>`
          : '';
        const voiceNumber = (staffIndex * MAX_VOICES_PER_STAFF) + voiceArrayIndex + 1;

        return `${backupXml}${events.map((event, eventIndex) => renderVoiceEvent(event, events, eventIndex, voiceNumber, staffConfig.staffNumber, timeSignature)).join('')}`;
      }).filter((voice): voice is string => Boolean(voice));

      if (renderedStaffVoices.length === 0) {
        const backupXml = staffIndex > 0 ? `<backup><duration>${divisionsPerMeasure}</duration></backup>` : '';
        return `${backupXml}${renderVoiceEvent({ kind: 'rest', duration: divisionsPerMeasure, startInMeasure: 0 }, [{ kind: 'rest', duration: divisionsPerMeasure, startInMeasure: 0 }], 0, (staffIndex * MAX_VOICES_PER_STAFF) + 1, staffConfig.staffNumber, timeSignature)}`;
      }

      if (staffIndex > 0) {
        renderedStaffVoices[0] = `<backup><duration>${divisionsPerMeasure}</duration></backup>${renderedStaffVoices[0]}`;
      }

      return renderedStaffVoices;
    }).join('');

    const attributesXml = measureIndex === 0
      ? (
        `<attributes>`
        + `<divisions>${DIVISIONS_PER_QUARTER}</divisions>`
        + `<key><fifths>0</fifths></key>`
        + `<time><beats>${timeSignature}</beats><beat-type>4</beat-type></time>`
        + `${staffVoiceGroups.length > 1 ? `<staves>${staffVoiceGroups.length}</staves>` : ''}`
        + `${staffVoiceGroups.map((staffConfig) => (
          `<clef${staffVoiceGroups.length > 1 ? ` number="${staffConfig.staffNumber}"` : ''}>`
          + `<sign>${staffConfig.clef}</sign>`
          + `<line>${staffConfig.clef === 'F' ? 4 : 2}</line>`
          + `</clef>`
        )).join('')}`
        + `</attributes>`
        + `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(bpm)}"/></direction>`
      )
      : '';

    const fallbackVoiceXml = staffVoiceGroups.every((staffConfig) => staffConfig.voices.length === 0)
      ? renderVoiceEvent({ kind: 'rest', duration: divisionsPerMeasure, startInMeasure: 0 }, [{ kind: 'rest', duration: divisionsPerMeasure, startInMeasure: 0 }], 0, 1, 1, timeSignature)
      : voiceXml;

    return `<measure number="${measureIndex + 1}">${attributesXml}${fallbackVoiceXml}</measure>`;
  }).join('');

  return `<part id="${sanitizePartId(part.id, partIndex)}">${measureXml}</part>`;
}

export function createScorePartDataFromSheetSage(
  id: string,
  name: string,
  noteEvents: SheetSageNoteEvent[],
): ScorePartData {
  return {
    id,
    name,
    instrumentName: 'melody',
    midiProgram: MUSICXML_PROGRAMS.melody,
    notes: noteEvents.map((note) => ({
      pitch: note.pitch,
      onset: note.onset,
      offset: note.offset,
    })),
  };
}

export function exportScorePartsToMusicXml(
  parts: ScorePartData[],
  options?: MusicXmlExportOptions,
): string {
  const bpm = options?.bpm ?? DEFAULT_BPM;
  const timeSignature = options?.timeSignature ?? 4;
  const filteredParts = parts.filter((part) => part.notes.length > 0);

  if (filteredParts.length === 0) {
    return '';
  }

  const divisionsPerMeasure = timeSignature * DIVISIONS_PER_QUARTER;
  const totalDivisions = filteredParts.reduce((maximum, part) => {
    const quantizedNotes = cleanQuantizedNotes(quantizeNotes(part.notes, bpm));
    const partMaximum = quantizedNotes.reduce(
      (partMax, note) => Math.max(partMax, note.endDivision),
      0,
    );
    return Math.max(maximum, partMaximum);
  }, 0);
  const measureCount = Math.max(1, Math.ceil(totalDivisions / divisionsPerMeasure));

  const partListXml = filteredParts.map((part, index) => {
    const partId = sanitizePartId(part.id, index);
    const midiProgram = part.midiProgram ?? MUSICXML_PROGRAMS[part.instrumentName?.toLowerCase() ?? 'piano'] ?? 1;
    const midiChannel = (index % 15) + 1;

    return (
      `<score-part id="${partId}">`
      + `<part-name>${escapeXml(part.name)}</part-name>`
      + `<score-instrument id="${partId}-I1"><instrument-name>${escapeXml(part.name)}</instrument-name></score-instrument>`
      + `<midi-instrument id="${partId}-I1"><midi-channel>${midiChannel}</midi-channel><midi-program>${midiProgram}</midi-program></midi-instrument>`
      + `</score-part>`
    );
  }).join('');

  const partsXml = filteredParts
    .map((part, index) => buildPartXml(part, index, bpm, timeSignature, measureCount))
    .join('');

  const titleXml = options?.title
    ? `<work><work-title>${escapeXml(options.title)}</work-title></work>`
    : '';

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1">',
    titleXml,
    '<identification><encoding><software>ChordMini</software></encoding></identification>',
    `<part-list>${partListXml}</part-list>`,
    partsXml,
    '</score-partwise>',
  ].join('');
}
