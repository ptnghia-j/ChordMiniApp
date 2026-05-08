import {
  buildLeadSheetMeasureChords,
  buildPianoNotationNoteEvents,
  exportLeadSheetToMusicXml,
  exportPianoVisualizerScoreToMusicXml,
} from '@/utils/musicXmlExport';
import { buildMelodyAbsoluteNoteEvents } from '@/utils/musicXmlExport/absoluteEvents';
import { GENERIC_DIVISIONS_PER_QUARTER } from '@/utils/musicXmlExport/constants';
import { buildNotationScore } from '@/utils/musicXmlExport/notationScore';
import { renderNotationScoreToMusicXml } from '@/utils/musicXmlExport/notationRender';
import { buildMeasureEventsWithMeterGeneric } from '@/utils/musicXmlExport/notationScore';
import { assignPianoHands, assignVoicesForStaff } from '@/utils/musicXmlExport/notationVoices';

function getMeasureXml(xml: string, measureNumber: number): string {
  const pattern = new RegExp(`<measure number="${measureNumber}"(?:\\s+implicit="yes")?>([\\s\\S]*?)</measure>`);
  return xml.match(pattern)?.[1] ?? '';
}

function extractSyncData(xml: string): {
  selectedAnacrusisDivisions?: number;
  selectedAnacrusisSeconds?: number;
  measureStartScoreTimes?: number[];
  measureStartAudioTimes?: number[];
} {
  const match = xml.match(/chordmini-sync-data:([\s\S]*?)-->/i);
  return JSON.parse(match?.[1]?.trim() ?? '{}');
}

function extractNoteDurations(measureXml: string): number[] {
  const noteBlocks = Array.from(measureXml.matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1]);

  return noteBlocks
    .filter((block) => !block.includes('<rest/>'))
    .map((block) => Number(block.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0))
    .filter((duration) => duration > 0);
}

function extractPartXml(xml: string, partId: string): string {
  return xml.match(new RegExp(`<part id="${partId}">([\\s\\S]*?)</part>`))?.[1] ?? '';
}

function getPartMeasureXml(xml: string, partId: string, measureNumber: number): string {
  const partXml = extractPartXml(xml, partId);
  const pattern = new RegExp(`<measure number="${measureNumber}"(?:\\s+implicit="yes")?>([\\s\\S]*?)</measure>`);
  return partXml.match(pattern)?.[1] ?? '';
}

function extractPartNoteDurations(xml: string, partId: string): number[] {
  const noteBlocks = Array.from(extractPartXml(xml, partId).matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1]);

  return noteBlocks
    .filter((block) => !block.includes('<rest/>'))
    .map((block) => Number(block.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0))
    .filter((duration) => duration > 0);
}

function extractPartNoteBlocks(xml: string, partId: string): string[] {
  return Array.from(extractPartXml(xml, partId).matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1])
    .filter((block) => !block.includes('<rest/>'));
}

function extractMeasureNoteBlocks(xml: string, partId: string, measureNumber: number): string[] {
  return Array.from(getPartMeasureXml(xml, partId, measureNumber).matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1])
    .filter((block) => !block.includes('<rest/>'));
}

function splitMeasureStreams(measureXml: string): string[] {
  return measureXml
    .split(/<backup><duration>\d+<\/duration><\/backup>/)
    .map((stream) => stream.trim())
    .filter((stream) => stream.length > 0);
}

function sumStreamDurations(streamXml: string): number {
  const noteDuration = Array.from(streamXml.matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1])
    .filter((block) => !block.includes('<chord/>'))
    .reduce((sum, block) => sum + Number(block.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0), 0);
  const forwardDuration = Array.from(streamXml.matchAll(/<forward>([\s\S]*?)<\/forward>/g), (match) => match[1])
    .reduce((sum, block) => sum + Number(block.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0), 0);

  return noteDuration + forwardDuration;
}

describe('musicXmlExport melody absolute events', () => {
  it('coalesces short same-pitch retriggers into a single melody note', () => {
    const notes = buildMelodyAbsoluteNoteEvents([
      { onset: 45.52045454545454, offset: 45.62954545454545, pitch: 67, velocity: 100 },
      { onset: 45.62954545454545, offset: 45.96818181818182, pitch: 67, velocity: 100 },
      { onset: 45.96818181818182, offset: 46.402272727272724, pitch: 70, velocity: 100 },
    ]);

    expect(notes).toHaveLength(2);
    expect(notes[0].pitch).toBe(67);
    expect(notes[0].onset).toBeCloseTo(45.52045454545454, 6);
    expect(notes[0].offset).toBeCloseTo(45.96818181818182, 6);
    expect(notes[1].pitch).toBe(70);
  });

  it('preserves longer same-pitch re-attacks as separate notes', () => {
    const notes = buildMelodyAbsoluteNoteEvents([
      { onset: 10, offset: 10.3, pitch: 65, velocity: 96 },
      { onset: 10.3, offset: 10.7, pitch: 65, velocity: 98 },
      { onset: 10.7, offset: 11.1, pitch: 67, velocity: 94 },
    ]);

    expect(notes).toHaveLength(3);
    expect(notes[0].pitch).toBe(65);
    expect(notes[0].offset).toBeCloseTo(10.3, 6);
    expect(notes[1].pitch).toBe(65);
    expect(notes[1].onset).toBeCloseTo(10.3, 6);
  });
});

describe('musicXmlExport lead sheet', () => {
  it('generates a melody-only MusicXML document', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.5, pitch: 72, velocity: 92 },
      { onset: 0.5, offset: 1.0, pitch: 74, velocity: 88 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
      title: 'ChordMini Lead Sheet',
    });

    expect(xml).toContain('<score-partwise version="3.1">');
    expect(xml).toContain('<part-name>Melody</part-name>');
    expect(xml).toContain('<work-title>ChordMini Lead Sheet</work-title>');
    expect(xml).toContain('<step>C</step>');
    expect(xml).toContain('<step>D</step>');
  });

  it('adds rests when the melody starts after silence', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0.5, offset: 1.0, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<rest/>');
    expect(xml).toContain('<duration>24</duration>');
  });

  it('adds tie markers when a melody note spans measures', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 2.5, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
  });

  it('splits a note at the metric center in simple meter instead of hiding the beat structure', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0.5, offset: 1.5, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    expect(xml).not.toContain('<duration>36</duration>');
    expect(xml).toContain('<duration>24</duration>');
    expect(xml.match(/<tie type="start"\/>/g)?.length ?? 0).toBeGreaterThan(0);
    expect(xml.match(/<tie type="stop"\/>/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it('collapses longer tied values to half-plus-quarter instead of dotted half', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 1.5, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).not.toContain('<duration>72</duration>');
    expect(xml).toContain('<duration>48</duration>');
    expect(xml).toContain('<duration>24</duration>');
  });

  it('uses dotted half for a full-bar sustain in 3/4', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 1.5, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
    });

    expect(xml).toContain('<duration>72</duration>');
    expect(xml).toContain('<type>half</type><dot/>');
    expect(xml).not.toContain('<tie type="start"/>');
    expect(xml).not.toContain('<tie type="stop"/>');
  });

  it('rewrites 3/4 carry-over 16th+half+dotted-8th with a collapsed carried beat', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 1.375, offset: 2.875, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure2 = getMeasureXml(xml, 2);

    expect(measure2).not.toContain('<duration>48</duration>');
    expect(extractNoteDurations(measure2)).toEqual([24, 24, 18]);
    expect(measure2).toContain('<tie type="start"/>');
    expect(measure2).toContain('<tie type="stop"/>');
  });

  it('collapses a fully tied 3/4 measure to dotted-half notation for dotted-8th carry-over', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 1.375, offset: 3.125, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure2 = getMeasureXml(xml, 2);

    expect(extractNoteDurations(measure2)).toEqual([72]);
    expect(measure2).toContain('<type>half</type><dot/>');
    expect(measure2).toContain('<tie type="start"/>');
    expect(measure2).toContain('<tie type="stop"/>');
  });

  it('collapses a fully tied 3/4 measure to dotted-half notation for 8th carry-over', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 1.25, offset: 3.25, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure2 = getMeasureXml(xml, 2);

    expect(extractNoteDurations(measure2)).toEqual([72]);
    expect(measure2).toContain('<type>half</type><dot/>');
    expect(measure2).toContain('<tie type="start"/>');
    expect(measure2).toContain('<tie type="stop"/>');
  });

  it('rewrites 3/4 carry-over 8th + quarter with a collapsed first beat', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 1.25, offset: 2.5, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure2 = getMeasureXml(xml, 2);

    expect(extractNoteDurations(measure2)).toEqual([24, 24]);
  });

  it('collapses 3/4 carry-over 8th + half to dotted-half when the tied note ends at the barline', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 1.25, offset: 3.0, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure2 = getMeasureXml(xml, 2);

    expect(extractNoteDurations(measure2)).toEqual([72]);
    expect(measure2).toContain('<type>half</type><dot/>');
    expect(measure2).not.toContain('<duration>48</duration>');
  });

  it('collapses 3/4 carry-over 16th + half to dotted-half when the tied note ends at the barline', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 1.125, offset: 3.0, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure2 = getMeasureXml(xml, 2);

    expect(extractNoteDurations(measure2)).toEqual([72]);
    expect(measure2).toContain('<type>half</type><dot/>');
    expect(measure2).not.toContain('<duration>48</duration>');
  });

  it('collapses a 3/4 carry-over in measure 10 to dotted-half instead of short-plus-half notation', () => {
    const xml = exportLeadSheetToMusicXml([
      // 8th-note carry from measure 9 into measure 10, then sustain through the full measure 10.
      { onset: 13.25, offset: 15.0, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure10 = getMeasureXml(xml, 10);

    expect(extractNoteDurations(measure10)).toEqual([72]);
    expect(measure10).toContain('<type>half</type><dot/>');
    expect(measure10).not.toContain('<duration>48</duration>');
  });

  it('keeps a mid-beat 3/4 sustain beat-local instead of turning the trailing duration into a half note', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0.25, offset: 1.5, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 3,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure1 = getMeasureXml(xml, 1);

    expect(extractNoteDurations(measure1)).toEqual([12, 24, 24]);
    expect(measure1).not.toContain('<duration>48</duration>');
  });

  it('rewrites 4/4 carry-over 8th + half into beat-covering fragments before long values', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 1.75, offset: 3.25, pitch: 72, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const measure2 = getMeasureXml(xml, 2);

    expect(extractNoteDurations(measure2)).toEqual([24, 24, 12]);
    expect(measure2).not.toContain('<duration>48</duration>');
  });

  it('beams eighth notes together within a simple-meter beat group', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.25, pitch: 72, velocity: 90 },
      { onset: 0.25, offset: 0.5, pitch: 74, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<beam number="1">begin</beam>');
    expect(xml).toContain('<beam number="1">end</beam>');
  });

  it('does not beam eighth notes across compound-meter beat groups', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.25, pitch: 72, velocity: 90 },
      { onset: 0.25, offset: 0.5, pitch: 74, velocity: 90 },
      { onset: 0.5, offset: 0.75, pitch: 76, velocity: 90 },
      { onset: 0.75, offset: 1.0, pitch: 77, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 6,
    });

    expect(xml.match(/<beam number="1">begin<\/beam>/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it('builds chord labels grouped by measure without repeating consecutive duplicates', () => {
    const measures = buildLeadSheetMeasureChords([
      { chordName: 'C:maj', startTime: 0, endTime: 1 },
      { chordName: 'C:maj', startTime: 0.5, endTime: 1.5 },
      { chordName: 'G:maj', startTime: 2.1, endTime: 3.0 },
      { chordName: 'A:min', startTime: 2.6, endTime: 3.4 },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(measures[0]).toEqual({ measureIndex: 0, labels: ['C'] });
    expect(measures[1]).toEqual({ measureIndex: 1, labels: ['G', 'Am'] });
  });

  it('writes chord labels below measures in the exported lead sheet', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.5, pitch: 72, velocity: 92 },
    ], [
      { chordName: 'Bb:maj', startTime: 0, endTime: 1 },
      { chordName: 'Eb:maj/3', startTime: 2.1, endTime: 3.0 },
    ], {
      bpm: 120,
      timeSignature: 4,
      keySignature: 'Bb major',
    });

    expect(xml).toContain('<direction placement="below">');
    expect(xml).toContain('font-family="Helvetica Neue, Helvetica, Arial, sans-serif"');
    expect(xml).toContain('>B♭<');
    expect(xml).toContain('>E♭/G<');
  });

  it('uses the provided song key signature for the lead sheet key', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.5, pitch: 72, velocity: 92 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
      keySignature: 'E major',
    });

    expect(xml).toContain('<key><fifths>4</fifths></key>');
  });

  it('spells accidentals to match a flat key signature', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.5, pitch: 63, velocity: 92 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
      keySignature: 'Bb major',
    });

    expect(xml).toContain('<step>E</step><alter>-1</alter>');
    expect(xml).not.toContain('<step>D</step><alter>1</alter>');
  });

  it('regroups beat-crossing dotted and quarter values into beat-local tied chunks', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.25, pitch: 72, velocity: 90 },
      { onset: 0.25, offset: 1.0, pitch: 74, velocity: 90 },
      { onset: 1.0, offset: 1.25, pitch: 76, velocity: 90 },
      { onset: 1.25, offset: 1.75, pitch: 77, velocity: 90 },
      { onset: 1.75, offset: 2.0, pitch: 79, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).not.toContain('<duration>36</duration>');
    expect((xml.match(/<duration>12<\/duration>/g)?.length ?? 0)).toBeGreaterThanOrEqual(5);
    expect(xml).toContain('<duration>24</duration>');
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
  });

  it('allows dotted eighth regrouping within a beat while still splitting at beat boundaries', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.375, pitch: 72, velocity: 90 },
      { onset: 0.375, offset: 0.625, pitch: 74, velocity: 90 },
      { onset: 0.625, offset: 1.125, pitch: 76, velocity: 90 },
      { onset: 1.125, offset: 1.375, pitch: 77, velocity: 90 },
      { onset: 1.375, offset: 1.875, pitch: 79, velocity: 90 },
      { onset: 1.875, offset: 2.0, pitch: 81, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<duration>18</duration>');
    expect(xml).toContain('<dot/>');
    expect((xml.match(/<duration>6<\/duration>/g)?.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
  });

  it('beams dotted eighth and sixteenth notes together inside the same beat group', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 0, offset: 0.375, pitch: 72, velocity: 90 },
      { onset: 0.375, offset: 0.5, pitch: 74, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<beam number="1">begin</beam>');
    expect(xml).toContain('<beam number="1">end</beam>');
    expect(xml).toContain('<beam number="2">backward hook</beam>');
  });

  it('searches eighth-note anacrusis candidates and chooses a tie-minimizing pickup layout', () => {
    const noteEvents = [
      { onset: 3, offset: 5, pitch: 67, velocity: 90 },
    ];

    const baselineXml = exportLeadSheetToMusicXml(noteEvents, [], {
      bpm: 120,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });
    const optimizedXml = exportLeadSheetToMusicXml(noteEvents, [], {
      bpm: 120,
      timeSignature: 4,
    });

    const baselineTieStarts = baselineXml.match(/<tie type="start"\/>/g)?.length ?? 0;
    const optimizedTieStarts = optimizedXml.match(/<tie type="start"\/>/g)?.length ?? 0;
    const tieGap = optimizedTieStarts - baselineTieStarts;
    const tieGapTolerance = Math.max(12, Math.ceil(baselineTieStarts * 0.06));
    const syncData = extractSyncData(optimizedXml);

    expect(tieGap).toBeLessThanOrEqual(tieGapTolerance);
    expect(optimizedXml).toContain('<measure number="1" implicit="yes">');
    expect(syncData.selectedAnacrusisDivisions).toBeGreaterThan(0);
    expect(syncData.selectedAnacrusisDivisions).toBeLessThanOrEqual(96);
    expect((syncData.selectedAnacrusisDivisions ?? 0) % 12).toBe(0);
    expect(syncData.measureStartScoreTimes?.length).toBeGreaterThan(0);
    expect(syncData.measureStartAudioTimes?.length).toBe(syncData.measureStartScoreTimes?.length);
    expect(syncData.measureStartScoreTimes?.[1]).toBeCloseTo(syncData.selectedAnacrusisSeconds ?? 0, 6);
    expect(syncData.measureStartAudioTimes?.[1]).toBeCloseTo(syncData.selectedAnacrusisSeconds ?? 0, 6);
  });

  it('marks the first measure as implicit pickup when anacrusis is selected', () => {
    const xml = exportLeadSheetToMusicXml([
      { onset: 3, offset: 4, pitch: 67, velocity: 90 },
    ], [], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<measure number="1" implicit="yes">');
    expect(getMeasureXml(xml, 1)).toContain('<rest/>');
    expect(getMeasureXml(xml, 2)).toContain('<rest/>');
  });

  it('builds playback-aligned piano notation note events from scheduled piano voicings', () => {
    const noteEvents = buildPianoNotationNoteEvents([
      {
        chordName: 'C',
        startTime: 0,
        endTime: 2,
        beatIndex: 0,
        beatCount: 4,
        notes: [
          { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
          { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
          { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
          { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(noteEvents.length).toBeGreaterThan(0);
    expect(noteEvents.some((note) => note.pitch <= 48)).toBe(true);
    expect(noteEvents.every((note) => note.offset > note.onset)).toBe(true);
    expect(noteEvents.some((note) => note.handHint === 'left')).toBe(true);
  });

  it('shortens repeating right-hand piano attacks for notation before the next onset', () => {
    const noteEvents = buildPianoNotationNoteEvents([
      {
        chordName: 'D',
        startTime: 0,
        endTime: 2,
        beatIndex: 0,
        beatCount: 4,
        notes: [
          { name: 'D2', noteName: 'D', octave: 2, midi: 38 },
          { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
          { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
          { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });
    const rightHandNotes = noteEvents
      .filter((note) => note.handHint !== 'left')
      .sort((left, right) => (
        left.onset - right.onset
        || left.offset - right.offset
        || left.pitch - right.pitch
      ));

    for (let index = 0; index < rightHandNotes.length;) {
      const groupOnset = rightHandNotes[index].onset;
      let nextIndex = index + 1;

      while (nextIndex < rightHandNotes.length && Math.abs(rightHandNotes[nextIndex].onset - groupOnset) <= 0.01) {
        nextIndex += 1;
      }

      const nextOnset = rightHandNotes[nextIndex]?.onset;
      if (nextOnset !== undefined) {
        const group = rightHandNotes.slice(index, nextIndex);
        expect(group.every((note) => note.offset <= nextOnset + 1e-6)).toBe(true);
      }

      index = nextIndex;
    }
  });

  it('uses a single block chord for piano notation when simplification asks for simple block chords', () => {
    const noteEvents = buildPianoNotationNoteEvents([
      {
        chordName: 'C',
        startTime: 0,
        endTime: 2,
        beatIndex: 0,
        beatCount: 4,
        notes: [
          { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
          { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
          { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
          { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
      simpleBlockChord: true,
    });

    expect(noteEvents.length).toBeGreaterThan(0);
    expect(new Set(noteEvents.map((note) => note.onset))).toEqual(new Set([0]));
    expect(noteEvents.every((note) => note.offset === 2)).toBe(true);
  });

  it('does not re-extend right-hand piano notation to a whole-bar sustain after quantization', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'D',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'D2', noteName: 'D', octave: 2, midi: 38 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);
    const trebleNotes = Array.from(measure1.matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1])
      .filter((note) => note.includes('<staff>1</staff>') && note.includes('<pitch>'));

    expect(trebleNotes.some((note) => note.includes('<type>whole</type>'))).toBe(false);
  });

  it('exports a piano-only grand staff MusicXML score with version 2 sync metadata', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      title: 'Piano Score',
      keySignature: 'C major',
    });

    expect(xml).toContain('<score-part id="PPiano">');
    expect(xml).toContain('<staves>2</staves>');
    expect(xml).toContain('<clef number="1"><sign>G</sign><line>2</line></clef>');
    expect(xml).toContain('<clef number="2"><sign>F</sign><line>4</line></clef>');
    expect(xml).toContain('"version":2');
    expect(xml).not.toContain('<score-part id="PMelody">');
  });

  it('writes later piano measures with the active modulated key signature and flat spelling', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D5', noteName: 'D', octave: 5, midi: 74 },
          ],
        },
        {
          chordName: 'G#',
          startTime: 2,
          endTime: 4,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'G#2', noteName: 'G#', octave: 2, midi: 44 },
            { name: 'G#4', noteName: 'G#', octave: 4, midi: 68 },
            { name: 'C5', noteName: 'C', octave: 5, midi: 72 },
            { name: 'D#5', noteName: 'D#', octave: 5, midi: 75 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      keySignature: 'G major',
      keySections: [
        { startBeatIndex: 0, keySignature: 'G major' },
        { startBeatIndex: 4, keySignature: 'Ab major' },
      ],
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);
    const measure2 = getPartMeasureXml(xml, 'PPiano', 2);

    expect(measure1).toContain('<key><fifths>1</fifths></key>');
    expect(measure2).toContain('<attributes><key><fifths>-4</fifths></key></attributes>');
    expect(measure2).toContain('<root-step text="A♭">A</root-step><root-alter print-object="no">-1</root-alter>');
    expect(measure2).toContain('<step>A</step><alter>-1</alter>');
    expect(measure2).not.toContain('<step>G</step><alter>1</alter>');
  });

  it('canonicalizes C# major to Db major spelling in piano notation', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C#',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'C#2', noteName: 'C#', octave: 2, midi: 37 },
            { name: 'C#4', noteName: 'C#', octave: 4, midi: 61 },
            { name: 'F4', noteName: 'F', octave: 4, midi: 65 },
            { name: 'G#4', noteName: 'G#', octave: 4, midi: 68 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      keySignature: 'C# major',
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(measure1).toContain('<key><fifths>-5</fifths></key>');
    expect(measure1).toContain('<step>F</step><octave>4</octave>');
    expect(measure1).not.toContain('<step>E</step><alter>1</alter>');
  });

  it('canonicalizes Ab minor to G# minor spelling in piano notation', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'Abm',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'Ab2', noteName: 'Ab', octave: 2, midi: 44 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'Eb5', noteName: 'Eb', octave: 5, midi: 75 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      keySignature: 'Ab minor',
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(measure1).toContain('<key><fifths>5</fifths></key>');
    expect(measure1).toContain('<step>B</step><octave>4</octave>');
    expect(measure1).not.toContain('<step>C</step><alter>-1</alter>');
  });

  it('canonicalizes unsupported enharmonic key signatures before emitting MusicXML fifths', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'Ab',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'Ab2', noteName: 'Ab', octave: 2, midi: 44 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
            { name: 'C5', noteName: 'C', octave: 5, midi: 72 },
            { name: 'Eb5', noteName: 'Eb', octave: 5, midi: 75 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      keySignature: 'G# major',
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(measure1).toContain('<key><fifths>-4</fifths></key>');
    expect(measure1).not.toContain('<key><fifths>0</fifths></key>');
  });

  it('exports melody plus piano as a combined score without changing the SheetMusicDisplay contract', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      melodyNoteEvents: [
        { onset: 0, offset: 0.5, pitch: 72, velocity: 90 },
        { onset: 0.5, offset: 1, pitch: 74, velocity: 90 },
      ],
      bpm: 120,
      timeSignature: 4,
      title: 'Combined Score',
      keySignature: 'C major',
    });

    expect(xml).toContain('<score-part id="PMelody">');
    expect(xml).toContain('<score-part id="PPiano">');
    expect(xml).toContain('<part id="PMelody">');
    expect(xml).toContain('<part id="PPiano">');
    expect(xml).toContain('<direction placement="above">');
  });

  it('keeps combined-score melody durations on the legacy playback-aligned grid instead of piano-style trimming', () => {
    const melody = [
      { onset: 0.25, offset: 1.5, pitch: 72, velocity: 90 },
      { onset: 1.5, offset: 1.875, pitch: 72, velocity: 90 },
      { onset: 1.875, offset: 2.5, pitch: 74, velocity: 90 },
    ];
    const legacyXml = exportLeadSheetToMusicXml(melody, [], {
      bpm: 120,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });
    const combinedXml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 0,
          endTime: 4,
          beatIndex: 0,
          beatCount: 8,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      melodyNoteEvents: melody,
      bpm: 120,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    expect(extractPartNoteDurations(combinedXml, 'PMelody')).toEqual(
      extractPartNoteDurations(legacyXml, 'PMelody').map((duration) => duration * 105),
    );
  });

  it('uses the piano beat grid for combined score layout when piano notation is present', () => {
    const combinedXml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 0,
          endTime: 4,
          beatIndex: 0,
          beatCount: 8,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      melodyNoteEvents: [
        { onset: 3, offset: 4, pitch: 67, velocity: 90 },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const combinedSyncData = extractSyncData(combinedXml);

    expect(combinedXml).not.toContain('<measure number="1" implicit="yes">');
    expect(combinedSyncData.selectedAnacrusisDivisions).toBe(0);
  });

  it('preserves at least as many piano note attacks in notation as are generated for playback', () => {
    const chordEvents = [
      {
        chordName: 'C',
        startTime: 0,
        endTime: 4,
        beatIndex: 0,
        beatCount: 8,
        notes: [
          { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
          { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
          { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
          { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
        ],
      },
    ];
    const playbackNotes = buildPianoNotationNoteEvents(chordEvents as any, {
      bpm: 120,
      timeSignature: 4,
    });
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: chordEvents as any,
      bpm: 120,
      timeSignature: 4,
    });

    expect(extractPartNoteBlocks(xml, 'PPiano').length).toBeGreaterThanOrEqual(playbackNotes.length);
  });

  it('emits stem directions matching the middle-line engraving rule', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 0,
          endTime: 1,
          beatIndex: 0,
          beatCount: 2,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      melodyNoteEvents: [
        { onset: 0, offset: 0.5, pitch: 72, velocity: 90 },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const melodyNotes = extractPartNoteBlocks(xml, 'PMelody');
    const pianoNotes = extractPartNoteBlocks(xml, 'PPiano');
    const melodyC5 = melodyNotes.find((note) => note.includes('<step>C</step><octave>5</octave>'));
    const pianoC3 = pianoNotes.find((note) => note.includes('<step>C</step><octave>3</octave>'));

    expect(melodyC5).toBeDefined();
    expect(melodyC5).toContain('<stem>down</stem>');
    expect(pianoC3).toBeDefined();
    expect(pianoC3).toContain('<stem>up</stem>');
  });

  it('uses opposite stems for multiple voices on the same staff', () => {
    const score = buildNotationScore({
      bpm: 120,
      timeSignature: 4,
      title: 'Stem Regression',
      keySignature: 'C major',
      chordEvents: [],
      beatTimes: [],
      melodyNotes: [],
      pianoNotes: [
        {
          partId: 'PPiano',
          part: 'PPiano',
          measureIndex: 0,
          rawStartDivision: 0,
          rawEndDivision: 24,
          rawChordStartDivision: 0,
          rawChordEndDivision: 24,
          startDivision: 0,
          endDivision: 24,
          pitch: 76,
          onset: 0,
          offset: 0.5,
          velocity: 90,
          chordStartTime: 0,
          beatIndex: 0,
          source: 'piano',
          staff: 1,
          voice: 1,
          tieStart: false,
          tieStop: false,
          tuplet: null,
        },
        {
          partId: 'PPiano',
          part: 'PPiano',
          measureIndex: 0,
          rawStartDivision: 0,
          rawEndDivision: 24,
          rawChordStartDivision: 0,
          rawChordEndDivision: 24,
          startDivision: 0,
          endDivision: 24,
          pitch: 64,
          onset: 0,
          offset: 0.5,
          velocity: 90,
          chordStartTime: 0,
          beatIndex: 0,
          source: 'piano',
          staff: 1,
          voice: 2,
          tieStart: false,
          tieStop: false,
          tuplet: null,
        },
      ] as any,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const xml = renderNotationScoreToMusicXml(score);
    const pianoNotes = extractPartNoteBlocks(xml, 'PPiano');
    const upperVoiceNote = pianoNotes.find((note) => note.includes('<octave>5</octave>'));
    const lowerVoiceNote = pianoNotes.find((note) => note.includes('<octave>4</octave>'));

    expect(upperVoiceNote).toContain('<stem>up</stem>');
    expect(lowerVoiceNote).toContain('<stem>down</stem>');
  });

  it('renders later repeated key signatures when the modulation returns to an earlier key', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
        {
          chordName: 'G',
          startTime: 8,
          endTime: 10,
          beatIndex: 16,
          beatCount: 4,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D5', noteName: 'D', octave: 5, midi: 74 },
          ],
        },
        {
          chordName: 'Eb',
          startTime: 16,
          endTime: 18,
          beatIndex: 32,
          beatCount: 4,
          notes: [
            { name: 'Eb2', noteName: 'Eb', octave: 2, midi: 39 },
            { name: 'Eb4', noteName: 'Eb', octave: 4, midi: 63 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'Bb4', noteName: 'Bb', octave: 4, midi: 70 },
          ],
        },
        {
          chordName: 'C',
          startTime: 24,
          endTime: 26,
          beatIndex: 48,
          beatCount: 4,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      keySignature: 'E major',
      keySections: [
        { startBeatIndex: 0, keySignature: 'E major' },
        { startBeatIndex: 16, keySignature: 'G major' },
        { startBeatIndex: 32, keySignature: 'Eb major' },
        { startBeatIndex: 48, keySignature: 'E major' },
      ],
    });

    expect(getPartMeasureXml(xml, 'PPiano', 1)).toContain('<key><fifths>4</fifths></key>');
    expect(getPartMeasureXml(xml, 'PPiano', 5)).toContain('<attributes><key><fifths>1</fifths></key></attributes>');
    expect(getPartMeasureXml(xml, 'PPiano', 9)).toContain('<attributes><key><fifths>-3</fifths></key></attributes>');
    expect(getPartMeasureXml(xml, 'PPiano', 13)).toContain('<attributes><key><fifths>4</fifths></key></attributes>');
  });

  it('adds a bold end barline on the last measure', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
  });

  it('searches pickup candidates for piano-only scores instead of using only the first onset modulo the bar', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 3,
          endTime: 4,
          beatIndex: 6,
          beatCount: 2,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const syncData = extractSyncData(xml);

    expect(xml).toContain('<measure number="1" implicit="yes">');
    expect(syncData.selectedAnacrusisDivisions).toBeGreaterThan(0);
  });

  it('keeps later piano chord attacks inside their source measure instead of quantizing them into the previous measure', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D5', noteName: 'D', octave: 5, midi: 74 },
          ],
        },
        {
          chordName: 'D/F#',
          startTime: 2,
          endTime: 4,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'F#2', noteName: 'F#', octave: 2, midi: 42 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);
    const measure2 = getPartMeasureXml(xml, 'PPiano', 2);
    const syncData = extractSyncData(xml);

    expect(measure1).not.toContain('<step>F</step><alter>1</alter>');
    expect(measure2).toContain('<step>F</step><alter>1</alter>');
    expect(syncData.measureStartAudioTimes?.slice(0, 2)).toEqual([0, 2]);
  });

  it('anchors measure sync starts to the beat grid when a chord is held across a barline', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G/B',
          startTime: 0,
          endTime: 3,
          beatIndex: 0,
          beatCount: 6,
          notes: [
            { name: 'B2', noteName: 'B', octave: 2, midi: 47 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D5', noteName: 'D', octave: 5, midi: 74 },
          ],
        },
        {
          chordName: 'D',
          startTime: 3,
          endTime: 4,
          beatIndex: 6,
          beatCount: 2,
          notes: [
            { name: 'D2', noteName: 'D', octave: 2, midi: 38 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
          ],
        },
      ],
      melodyBeatTimes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
      bpm: 120,
      timeSignature: 4,
    });

    const syncData = extractSyncData(xml);

    expect(syncData.measureStartAudioTimes?.[0]).toBeCloseTo(0, 6);
    expect(syncData.measureStartAudioTimes?.[1]).toBeCloseTo(2, 6);
  });

  it('keeps upper-register D4 notes in treble while bass sustains B3 for G/B across the barline', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G/B',
          startTime: 0,
          endTime: 3,
          beatIndex: 0,
          beatCount: 6,
          notes: [
            { name: 'B2', noteName: 'B', octave: 2, midi: 47 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
          ],
        },
        {
          chordName: 'D',
          startTime: 3,
          endTime: 4,
          beatIndex: 6,
          beatCount: 2,
          notes: [
            { name: 'D2', noteName: 'D', octave: 2, midi: 38 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
          ],
        },
      ],
      melodyBeatTimes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
      bpm: 120,
      timeSignature: 4,
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);
    const measure2 = getPartMeasureXml(xml, 'PPiano', 2);
    const measure1Notes = Array.from(measure1.matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1]);
    const measure2Notes = Array.from(measure2.matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1]);
    const measure1BassD4 = measure1Notes.filter((note) => (
      note.includes('<step>D</step><octave>4</octave>') && note.includes('<staff>2</staff>')
    ));
    const measure2BassD4 = measure2Notes.filter((note) => (
      note.includes('<step>D</step><octave>4</octave>') && note.includes('<staff>2</staff>')
    ));

    expect(measure1BassD4).toHaveLength(0);
    expect(measure2BassD4).toHaveLength(0);
    expect(measure1).toContain('<step>B</step><octave>3</octave></pitch><duration>10080</duration><voice>1</voice><type>whole</type><staff>2</staff>');
  });

  it('keeps each exported piano stream within a single 4/4 measure even when playback patterns repeat', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D5', noteName: 'D', octave: 5, midi: 74 },
          ],
        },
        {
          chordName: 'D',
          startTime: 2,
          endTime: 4,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'D2', noteName: 'D', octave: 2, midi: 38 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const measure2 = getPartMeasureXml(xml, 'PPiano', 2);
    const streamDurations = splitMeasureStreams(measure2).map(sumStreamDurations);

    expect(streamDurations.length).toBeGreaterThan(0);
    expect(streamDurations.every((duration) => duration <= 10080)).toBe(true);
  });

  it('normalizes overlapping chord segments so one voice cannot exceed a 4/4 bar', () => {
    const divisionsPerQuarter = 2520;
    const divisionsPerMeasure = divisionsPerQuarter * 4;
    const events = buildMeasureEventsWithMeterGeneric(
      [
        {
          partId: 'PPiano',
          measureIndex: 0,
          startInMeasure: 0,
          duration: divisionsPerQuarter * 2,
          pitches: [47],
          chordName: 'Bm',
          staff: 2,
          voice: 1,
          tieStart: false,
          tieStop: false,
          beatCarryDuration: 0,
          tuplet: null,
        },
        {
          partId: 'PPiano',
          measureIndex: 0,
          startInMeasure: divisionsPerQuarter,
          duration: divisionsPerQuarter,
          pitches: [50],
          chordName: 'Bm',
          staff: 2,
          voice: 1,
          tieStart: false,
          tieStop: false,
          beatCarryDuration: 0,
          tuplet: null,
        },
        {
          partId: 'PPiano',
          measureIndex: 0,
          startInMeasure: divisionsPerQuarter * 2,
          duration: divisionsPerQuarter,
          pitches: [52],
          chordName: 'Bm',
          staff: 2,
          voice: 1,
          tieStart: false,
          tieStop: false,
          beatCarryDuration: 0,
          tuplet: null,
        },
      ],
      divisionsPerMeasure,
      4,
      divisionsPerQuarter,
    );

    const occupiedDuration = events.reduce((sum, event) => sum + event.duration, 0);
    const overlappingChord = events.find((event) => event.kind === 'chord' && event.startInMeasure === divisionsPerQuarter);

    expect(occupiedDuration).toBe(divisionsPerMeasure);
    expect(overlappingChord).toBeUndefined();
  });

  it('forces stem directions by voice when treble staff has two active voices', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G/B',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'B2', noteName: 'B', octave: 2, midi: 47 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
          ],
        },
        {
          chordName: 'D',
          startTime: 2,
          endTime: 4,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'D2', noteName: 'D', octave: 2, midi: 38 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
          ],
        },
        {
          chordName: 'G',
          startTime: 4,
          endTime: 6,
          beatIndex: 8,
          beatCount: 4,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
          ],
        },
      ],
      melodyBeatTimes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6],
      bpm: 120,
      timeSignature: 4,
    });
    const measure2 = getPartMeasureXml(xml, 'PPiano', 2);
    const noteBlocks = Array.from(measure2.matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1]);
    const trebleVoice1Stemmed = noteBlocks.filter((note) => (
      note.includes('<staff>1</staff>')
      && note.includes('<voice>1</voice>')
      && !note.includes('<type>whole</type>')
      && note.includes('<pitch>')
    ));
    const trebleVoice2Stemmed = noteBlocks.filter((note) => (
      note.includes('<staff>1</staff>')
      && note.includes('<voice>2</voice>')
      && !note.includes('<type>whole</type>')
      && note.includes('<pitch>')
    ));

    expect(trebleVoice1Stemmed.length).toBeGreaterThan(0);
    if (trebleVoice2Stemmed.length > 0) {
      expect(trebleVoice1Stemmed.every((note) => note.includes('<stem>up</stem>'))).toBe(true);
      expect(trebleVoice2Stemmed.every((note) => note.includes('<stem>down</stem>'))).toBe(true);
    }
  });

  it('keeps inversion companion tones out of bass when a single bass anchor is already sustained', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G/B',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'B2', noteName: 'B', octave: 2, midi: 47 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
          ],
        },
        {
          chordName: 'D',
          startTime: 2,
          endTime: 4,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'D2', noteName: 'D', octave: 2, midi: 38 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
          ],
        },
        {
          chordName: 'G',
          startTime: 4,
          endTime: 6,
          beatIndex: 8,
          beatCount: 4,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
          ],
        },
      ],
      melodyBeatTimes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6],
      bpm: 120,
      timeSignature: 4,
    });

    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);
    const bassNotes = Array.from(measure1.matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1])
      .filter((note) => note.includes('<staff>2</staff>') && note.includes('<pitch>'));
    const bassD3 = bassNotes.filter((note) => note.includes('<step>D</step><octave>3</octave>'));

    expect(bassNotes.some((note) => note.includes('<step>B</step><octave>3</octave>'))).toBe(true);
    expect(bassD3).toHaveLength(0);
  });

  it('keeps explicit left-hand inversion anchors on bass staff instead of reassigning them to treble', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G/B',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'B2', noteName: 'B', octave: 2, midi: 47 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
          ],
        },
        {
          chordName: 'D',
          startTime: 2,
          endTime: 4,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'D2', noteName: 'D', octave: 2, midi: 38 },
            { name: 'D4', noteName: 'D', octave: 4, midi: 62 },
            { name: 'F#4', noteName: 'F#', octave: 4, midi: 66 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
          ],
        },
      ],
      melodyBeatTimes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
      bpm: 120,
      timeSignature: 4,
    });

    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);
    const trebleNotes = Array.from(measure1.matchAll(/<note>([\s\S]*?)<\/note>/g), (match) => match[1])
      .filter((note) => note.includes('<staff>1</staff>') && note.includes('<pitch>'));
    const trebleB3 = trebleNotes.filter((note) => note.includes('<step>B</step><octave>3</octave>'));

    expect(trebleB3).toHaveLength(0);
  });

  it('positions piano-score chord labels at their actual onset within the measure', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 0,
          endTime: 1,
          beatIndex: 0,
          beatCount: 2,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
        {
          chordName: 'G',
          startTime: 1,
          endTime: 2,
          beatIndex: 2,
          beatCount: 2,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D5', noteName: 'D', octave: 5, midi: 74 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const pianoPartXml = extractPartXml(xml, 'PPiano');

    expect(pianoPartXml).toContain('<harmony placement="above" default-y="50" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="7" font-weight="normal">');
    expect(pianoPartXml).toContain('<root-step>C</root-step>');
    expect(pianoPartXml).toContain('<root-step>G</root-step>');
    expect(pianoPartXml).toContain('<kind use-symbols="no" default-y="50" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="7" font-weight="normal">major</kind>');
    expect(pianoPartXml).toContain('<offset sound="no">5040</offset>');
  });

  it('renders harmony roots and slash bass notes with flat glyph display text', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'Db/Ab',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'Ab2', noteName: 'Ab', octave: 2, midi: 44 },
            { name: 'Db4', noteName: 'Db', octave: 4, midi: 61 },
            { name: 'F4', noteName: 'F', octave: 4, midi: 65 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      keySignature: 'Db major',
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(measure1).toContain('<root-step text="D♭">D</root-step><root-alter print-object="no">-1</root-alter>');
    expect(measure1).toContain('<bass-step text="A♭">A</bass-step><bass-alter print-object="no">-1</bass-alter>');
  });

  it('renders half-diminished kind text with a flat glyph instead of parenthesized ascii accidental', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'Am7b5',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'A2', noteName: 'A', octave: 2, midi: 45 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
            { name: 'C5', noteName: 'C', octave: 5, midi: 72 },
            { name: 'Eb5', noteName: 'Eb', octave: 5, midi: 75 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(measure1).toContain('<kind text="m7♭5" use-symbols="no"');
    expect(measure1).toContain('>half-diminished</kind>');
    expect(measure1).not.toContain('(b)5');
  });

  it('preserves explicit display spelling for harmony labels even when key context prefers a different accidental', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'Ebm7b5',
          displayChordName: 'D#m7b5',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'Eb2', noteName: 'Eb', octave: 2, midi: 39 },
            { name: 'Eb4', noteName: 'Eb', octave: 4, midi: 63 },
            { name: 'Gb4', noteName: 'Gb', octave: 4, midi: 66 },
            { name: 'Bb4', noteName: 'Bb', octave: 4, midi: 70 },
            { name: 'Db5', noteName: 'Db', octave: 5, midi: 73 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      keySignature: 'Eb minor',
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(measure1).toContain('<root-step text="D♯">D</root-step><root-alter print-object="no">1</root-alter>');
    expect(measure1).toContain('<kind text="m7♭5" use-symbols="no"');
    expect(measure1).not.toContain('<root-step text="E♭">E</root-step><root-alter print-object="no">-1</root-alter>');
    expect(measure1).not.toContain('<direction-type><words');
  });

  it('derives half-diminished harmony kind from explicit display labels when playback chord symbols are simplified', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'A',
          displayChordName: 'Am7b5',
          startTime: 0,
          endTime: 2,
          beatIndex: 0,
          beatCount: 4,
          notes: [
            { name: 'A2', noteName: 'A', octave: 2, midi: 45 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
            { name: 'C5', noteName: 'C', octave: 5, midi: 72 },
            { name: 'Eb5', noteName: 'Eb', octave: 5, midi: 75 },
            { name: 'G5', noteName: 'G', octave: 5, midi: 79 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(measure1).toContain('<kind text="m7♭5" use-symbols="no"');
    expect(measure1).toContain('>half-diminished</kind>');
    expect(measure1).not.toContain('>major</kind>');
  });

  it('keeps near-sequential notes on one staff in a single voice when there is no true overlap', () => {
    const events = [
      {
        staff: 1,
        voice: 1,
        pitch: 69,
        startDivision: 0,
        endDivision: 5041,
      },
      {
        staff: 1,
        voice: 1,
        pitch: 71,
        startDivision: 5040,
        endDivision: 10080,
      },
    ] as any;

    assignVoicesForStaff(events, 1);

    expect(events.every((event: { voice: number }) => event.voice === 1)).toBe(true);
  });

  it('keeps floating companion tones on treble staff while a left-hand anchor is sustained', () => {
    const events = [
      {
        pitch: 35,
        startDivision: 0,
        endDivision: 10080,
        handHint: 'left',
        staffHint: 2,
        staff: 2,
        voice: 1,
      },
      {
        pitch: 52,
        startDivision: 2520,
        endDivision: 5040,
        handHint: undefined,
        staffHint: undefined,
        staff: 1,
        voice: 1,
      },
      {
        pitch: 64,
        startDivision: 2520,
        endDivision: 5040,
        handHint: undefined,
        staffHint: undefined,
        staff: 1,
        voice: 1,
      },
    ] as any;

    assignPianoHands(events, 4, 2520);

    const companionGroup = events.filter((event: { startDivision: number }) => event.startDivision === 2520);
    expect(companionGroup.every((event: { staff: number }) => event.staff === 1)).toBe(true);
  });

  it('collapses coextensive overlapping staff voices into one chord voice', () => {
    const events = [
      {
        staff: 2,
        voice: 1,
        pitch: 48,
        startDivision: 0,
        endDivision: 5041,
      },
      {
        staff: 2,
        voice: 1,
        pitch: 59,
        startDivision: 1,
        endDivision: 5040,
      },
      {
        staff: 2,
        voice: 1,
        pitch: 52,
        startDivision: 5040,
        endDivision: 7560,
      },
    ] as any;

    assignVoicesForStaff(events, 2);

    expect(events.every((event: { voice: number }) => event.voice === 1)).toBe(true);
  });

  it('keeps single-line bass-staff stems down above the middle line', () => {
    const quarter = GENERIC_DIVISIONS_PER_QUARTER;
    const score = buildNotationScore({
      bpm: 120,
      timeSignature: 4,
      chordEvents: [],
      melodyNotes: [],
      pianoNotes: [
        {
          partId: 'PPiano',
          pitch: 61,
          onset: 0,
          offset: 0.5,
          velocity: 80,
          chordStartTime: 0,
          chordEndTime: 0.5,
          beatIndex: 0,
          source: 'piano',
          rawStartDivision: 0,
          rawEndDivision: quarter,
          rawChordStartDivision: 0,
          rawChordEndDivision: quarter,
          startDivision: 0,
          endDivision: quarter,
          staff: 2,
          voice: 1,
          tuplet: null,
        },
      ] as any,
      enableLeadingSilenceAnacrusisSearch: false,
    });
    const xml = renderNotationScoreToMusicXml(score);
    const measure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(measure1).toContain('<stem>down</stem>');
  });

  it('carries multi-line staff stem roles into neighboring notes on the same staff', () => {
    const quarter = GENERIC_DIVISIONS_PER_QUARTER;
    const measure = quarter * 4;
    const score = buildNotationScore({
      bpm: 120,
      timeSignature: 4,
      chordEvents: [],
      melodyNotes: [],
      pianoNotes: [
        {
          partId: 'PPiano',
          pitch: 61,
          onset: 0,
          offset: 0.5,
          velocity: 80,
          chordStartTime: 0,
          chordEndTime: 0.5,
          beatIndex: 0,
          source: 'piano',
          rawStartDivision: 0,
          rawEndDivision: quarter,
          rawChordStartDivision: 0,
          rawChordEndDivision: quarter,
          startDivision: 0,
          endDivision: quarter,
          staff: 2,
          voice: 1,
          tuplet: null,
        },
        {
          partId: 'PPiano',
          pitch: 45,
          onset: 0,
          offset: 1,
          velocity: 80,
          chordStartTime: 0,
          chordEndTime: 1,
          beatIndex: 0,
          source: 'piano',
          rawStartDivision: 0,
          rawEndDivision: quarter * 2,
          rawChordStartDivision: 0,
          rawChordEndDivision: quarter * 2,
          startDivision: 0,
          endDivision: quarter * 2,
          staff: 2,
          voice: 2,
          tuplet: null,
        },
        {
          partId: 'PPiano',
          pitch: 61,
          onset: 2,
          offset: 2.5,
          velocity: 80,
          chordStartTime: 2,
          chordEndTime: 2.5,
          beatIndex: 4,
          source: 'piano',
          rawStartDivision: measure,
          rawEndDivision: measure + quarter,
          rawChordStartDivision: measure,
          rawChordEndDivision: measure + quarter,
          startDivision: measure,
          endDivision: measure + quarter,
          staff: 2,
          voice: 1,
          tuplet: null,
        },
      ] as any,
      enableLeadingSilenceAnacrusisSearch: false,
    });
    const xml = renderNotationScoreToMusicXml(score);
    const measure2 = getPartMeasureXml(xml, 'PPiano', 2);

    expect(measure2).toContain('<stem>up</stem>');
  });

  it('uses local pitch role instead of raw voice number for multi-line bass-staff stems', () => {
    const quarter = GENERIC_DIVISIONS_PER_QUARTER;
    const score = buildNotationScore({
      bpm: 120,
      timeSignature: 4,
      chordEvents: [],
      melodyNotes: [],
      pianoNotes: [
        {
          partId: 'PPiano',
          pitch: 53,
          onset: 0,
          offset: 1,
          velocity: 80,
          chordStartTime: 0,
          chordEndTime: 1,
          beatIndex: 0,
          source: 'piano',
          rawStartDivision: 0,
          rawEndDivision: quarter * 2,
          rawChordStartDivision: 0,
          rawChordEndDivision: quarter * 2,
          startDivision: 0,
          endDivision: quarter * 2,
          staff: 2,
          voice: 1,
          tuplet: null,
        },
        {
          partId: 'PPiano',
          pitch: 60,
          onset: 0.5,
          offset: 1,
          velocity: 80,
          chordStartTime: 0.5,
          chordEndTime: 1,
          beatIndex: 1,
          source: 'piano',
          rawStartDivision: quarter,
          rawEndDivision: quarter * 2,
          rawChordStartDivision: quarter,
          rawChordEndDivision: quarter * 2,
          startDivision: quarter,
          endDivision: quarter * 2,
          staff: 2,
          voice: 2,
          tuplet: null,
        },
      ] as any,
      enableLeadingSilenceAnacrusisSearch: false,
    });
    const xml = renderNotationScoreToMusicXml(score);
    const notes = extractMeasureNoteBlocks(xml, 'PPiano', 1);
    const lowerF = notes.find((note) => note.includes('<step>F</step><octave>3</octave>'));
    const upperC = notes.find((note) => note.includes('<step>C</step><octave>4</octave>'));

    expect(lowerF).toContain('<stem>down</stem>');
    expect(upperC).toContain('<stem>up</stem>');
  });

  it('starts a new system when adjacent measure-boundary chord labels would collide', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'Db',
          startTime: 0,
          endTime: 1,
          beatIndex: 0,
          beatCount: 2,
          notes: [
            { name: 'Db2', noteName: 'Db', octave: 2, midi: 37 },
            { name: 'Db4', noteName: 'Db', octave: 4, midi: 61 },
            { name: 'F4', noteName: 'F', octave: 4, midi: 65 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
          ],
        },
        {
          chordName: 'Ab7',
          startTime: 1,
          endTime: 2,
          beatIndex: 2,
          beatCount: 2,
          notes: [
            { name: 'Ab2', noteName: 'Ab', octave: 2, midi: 44 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
            { name: 'C5', noteName: 'C', octave: 5, midi: 72 },
            { name: 'Gb5', noteName: 'Gb', octave: 5, midi: 78 },
          ],
        },
        {
          chordName: 'Bbm7',
          startTime: 2,
          endTime: 3,
          beatIndex: 4,
          beatCount: 2,
          notes: [
            { name: 'Bb2', noteName: 'Bb', octave: 2, midi: 46 },
            { name: 'Bb4', noteName: 'Bb', octave: 4, midi: 70 },
            { name: 'Db5', noteName: 'Db', octave: 5, midi: 73 },
            { name: 'F5', noteName: 'F', octave: 5, midi: 77 },
          ],
        },
        {
          chordName: 'Db/F',
          startTime: 3,
          endTime: 4,
          beatIndex: 6,
          beatCount: 2,
          notes: [
            { name: 'F2', noteName: 'F', octave: 2, midi: 41 },
            { name: 'Db4', noteName: 'Db', octave: 4, midi: 61 },
            { name: 'F4', noteName: 'F', octave: 4, midi: 65 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
      keySignature: 'Db major',
    });

    expect(xml).toContain('<measure number="2"><print new-system="yes"/>');
  });

  it('starts a new system earlier when chord-symbol density gets too high', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'Ebm7',
          startTime: 0,
          endTime: 1,
          beatIndex: 0,
          beatCount: 2,
          notes: [
            { name: 'Eb2', noteName: 'Eb', octave: 2, midi: 39 },
            { name: 'Gb4', noteName: 'Gb', octave: 4, midi: 66 },
            { name: 'Bb4', noteName: 'Bb', octave: 4, midi: 70 },
            { name: 'Db5', noteName: 'Db', octave: 5, midi: 73 },
          ],
        },
        {
          chordName: 'Absus4(b7)',
          startTime: 1,
          endTime: 2,
          beatIndex: 2,
          beatCount: 2,
          notes: [
            { name: 'Ab2', noteName: 'Ab', octave: 2, midi: 44 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
            { name: 'Db5', noteName: 'Db', octave: 5, midi: 73 },
            { name: 'Gb5', noteName: 'Gb', octave: 5, midi: 78 },
          ],
        },
        {
          chordName: 'Db',
          startTime: 2,
          endTime: 3,
          beatIndex: 4,
          beatCount: 2,
          notes: [
            { name: 'Db2', noteName: 'Db', octave: 2, midi: 37 },
            { name: 'Db4', noteName: 'Db', octave: 4, midi: 61 },
            { name: 'F4', noteName: 'F', octave: 4, midi: 65 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
          ],
        },
        {
          chordName: 'Ab/C',
          startTime: 3,
          endTime: 4,
          beatIndex: 6,
          beatCount: 2,
          notes: [
            { name: 'C3', noteName: 'C', octave: 3, midi: 48 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
            { name: 'C5', noteName: 'C', octave: 5, midi: 72 },
            { name: 'Eb5', noteName: 'Eb', octave: 5, midi: 75 },
          ],
        },
        {
          chordName: 'Bbm7',
          startTime: 4,
          endTime: 5,
          beatIndex: 8,
          beatCount: 2,
          notes: [
            { name: 'Bb2', noteName: 'Bb', octave: 2, midi: 46 },
            { name: 'Bb4', noteName: 'Bb', octave: 4, midi: 70 },
            { name: 'Db5', noteName: 'Db', octave: 5, midi: 73 },
            { name: 'F5', noteName: 'F', octave: 5, midi: 77 },
          ],
        },
        {
          chordName: 'Db/Ab',
          startTime: 5,
          endTime: 6,
          beatIndex: 10,
          beatCount: 2,
          notes: [
            { name: 'Ab2', noteName: 'Ab', octave: 2, midi: 44 },
            { name: 'Db4', noteName: 'Db', octave: 4, midi: 61 },
            { name: 'F4', noteName: 'F', octave: 4, midi: 65 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
          ],
        },
        {
          chordName: 'Gb/Bb',
          startTime: 6,
          endTime: 7,
          beatIndex: 12,
          beatCount: 2,
          notes: [
            { name: 'Bb2', noteName: 'Bb', octave: 2, midi: 46 },
            { name: 'Gb4', noteName: 'Gb', octave: 4, midi: 66 },
            { name: 'Bb4', noteName: 'Bb', octave: 4, midi: 70 },
            { name: 'Db5', noteName: 'Db', octave: 5, midi: 73 },
          ],
        },
        {
          chordName: 'Db/F',
          startTime: 7,
          endTime: 8,
          beatIndex: 14,
          beatCount: 2,
          notes: [
            { name: 'F2', noteName: 'F', octave: 2, midi: 41 },
            { name: 'Db4', noteName: 'Db', octave: 4, midi: 61 },
            { name: 'F4', noteName: 'F', octave: 4, midi: 65 },
            { name: 'Ab4', noteName: 'Ab', octave: 4, midi: 68 },
          ],
        },
      ],
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<print new-system="yes"/>');
  });

  it('anchors piano-score chord label offsets to beat positions instead of raw seconds', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 9.66,
          endTime: 11.2,
          beatIndex: 13,
          beatCount: 2,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
        {
          chordName: 'G',
          startTime: 10.66,
          endTime: 12.23,
          beatIndex: 15,
          beatCount: 2,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D5', noteName: 'D', octave: 5, midi: 74 },
          ],
        },
      ],
      bpm: 70,
      timeSignature: 4,
    });
    const pianoPartXml = extractPartXml(xml, 'PPiano');

    expect(pianoPartXml).toContain('<offset sound="no">5040</offset>');
    expect(pianoPartXml).not.toContain('<offset sound="no">2940</offset>');
  });

  it('renders visible whole rests for empty piano measures in combined scores', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 4,
          endTime: 8,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      melodyNoteEvents: [
        { onset: 0, offset: 0.5, pitch: 72, velocity: 90 },
      ],
      bpm: 60,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });
    const pianoMeasure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(pianoMeasure1).toContain('<note><rest/><duration>');
  });

  it('preserves a pickup plus following silent full measure before the first piano chord', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'G',
          startTime: 7,
          endTime: 9,
          beatIndex: 7,
          beatCount: 2,
          notes: [
            { name: 'G2', noteName: 'G', octave: 2, midi: 43 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
            { name: 'B4', noteName: 'B', octave: 4, midi: 71 },
            { name: 'D5', noteName: 'D', octave: 5, midi: 74 },
          ],
        },
      ],
      melodyBeatTimes: [null, null, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      pickupBeatCount: 2,
      bpm: 60,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: true,
    });
    const pianoMeasure1 = getPartMeasureXml(xml, 'PPiano', 1);
    const pianoMeasure2 = getPartMeasureXml(xml, 'PPiano', 2);
    const pianoMeasure3 = getPartMeasureXml(xml, 'PPiano', 3);

    expect(xml).toContain('<measure number="1" implicit="yes">');
    expect(pianoMeasure1).toContain('<note><rest/><duration>');
    expect(pianoMeasure2).toContain('<note><rest/><duration>');
    expect(pianoMeasure3).toMatch(
      /<note><rest\/><duration>\d+<\/duration><voice>1<\/voice><type>quarter<\/type><staff>1<\/staff><\/note><note><pitch>/,
    );
    expect(pianoMeasure3).toContain('<step>G</step>');
  });

  it('prefers explicit pickupBeatCount over inferred first chord beat modulo', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 3,
          endTime: 4,
          beatIndex: 3,
          beatCount: 1,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      pickupBeatCount: 1,
      bpm: 60,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: true,
    });
    const pianoMeasure2 = getPartMeasureXml(xml, 'PPiano', 2);

    expect(xml).toContain('<measure number="1" implicit="yes">');
    expect(pianoMeasure2).toMatch(
      /<note><rest\/><duration>\d+<\/duration><voice>1<\/voice><type>[a-z]+<\/type><staff>1<\/staff><\/note><note><pitch>/,
    );
  });

  it('treats explicit zero pickupBeatCount as a fixed no-pickup layout', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 3,
          endTime: 4,
          beatIndex: 3,
          beatCount: 1,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      pickupBeatCount: 0,
      bpm: 60,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: true,
    });
    const pianoMeasure1 = getPartMeasureXml(xml, 'PPiano', 1);

    expect(xml).not.toContain('<measure number="1" implicit="yes">');
    expect(pianoMeasure1).toContain('<step>C</step>');
  });

  it('uses SheetSage beat times to align combined-score melody to the shared beat grid', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 2,
          endTime: 4,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      melodyNoteEvents: [
        { onset: 2, offset: 2.5, pitch: 72, velocity: 90 },
      ],
      melodyBeatTimes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
      bpm: 60,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });
    const melodyMeasure1 = getPartMeasureXml(xml, 'PMelody', 1);
    const melodyMeasure2 = getPartMeasureXml(xml, 'PMelody', 2);

    expect(melodyMeasure1).not.toContain('<step>C</step>');
    expect(melodyMeasure2).toContain('<step>C</step>');
  });

  it('preserves leading null beat slots when aligning combined-score melody to the visual grid', () => {
    const xml = exportPianoVisualizerScoreToMusicXml({
      chordEvents: [
        {
          chordName: 'C',
          startTime: 2,
          endTime: 4,
          beatIndex: 8,
          beatCount: 4,
          notes: [
            { name: 'C2', noteName: 'C', octave: 2, midi: 36 },
            { name: 'C4', noteName: 'C', octave: 4, midi: 60 },
            { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
            { name: 'G4', noteName: 'G', octave: 4, midi: 67 },
          ],
        },
      ],
      melodyNoteEvents: [
        { onset: 2, offset: 2.5, pitch: 72, velocity: 90 },
      ],
      melodyBeatTimes: [null, null, null, null, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
      bpm: 60,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });
    const melodyMeasure2 = getPartMeasureXml(xml, 'PMelody', 2);
    const melodyMeasure3 = getPartMeasureXml(xml, 'PMelody', 3);

    expect(melodyMeasure2).not.toContain('<step>C</step>');
    expect(melodyMeasure3).toContain('<step>C</step>');
  });
});
