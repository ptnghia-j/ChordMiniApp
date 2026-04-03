import { createScorePartDataFromSheetSage, exportScorePartsToMusicXml } from '@/utils/musicXmlExport';

describe('musicXmlExport', () => {
  it('generates a score-partwise document for visible instrument notes', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'piano',
        name: 'Piano',
        instrumentName: 'piano',
        notes: [
          { pitch: 60, onset: 0, offset: 0.5 },
          { pitch: 64, onset: 0, offset: 0.5 },
          { pitch: 67, onset: 0, offset: 0.5 },
          { pitch: 65, onset: 0.5, offset: 1.0 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
      title: 'ChordMini Piano Visualizer',
    });

    expect(xml).toContain('<score-partwise version="3.1">');
    expect(xml).toContain('<part-name>Piano</part-name>');
    expect(xml).toContain('<work-title>ChordMini Piano Visualizer</work-title>');
    expect(xml).toContain('<step>C</step>');
    expect(xml).toContain('<step>E</step>');
    expect(xml).toContain('<step>G</step>');
  });

  it('renders piano on a grand staff with treble and bass clefs', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'piano',
        name: 'Piano',
        instrumentName: 'piano',
        notes: [
          { pitch: 48, onset: 0, offset: 1.0 },
          { pitch: 52, onset: 0, offset: 1.0 },
          { pitch: 64, onset: 0, offset: 1.0 },
          { pitch: 67, onset: 0, offset: 1.0 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<staves>2</staves>');
    expect(xml).toContain('<clef number="1"><sign>G</sign><line>2</line></clef>');
    expect(xml).toContain('<clef number="2"><sign>F</sign><line>4</line></clef>');
    expect(xml).toContain('<staff>1</staff>');
    expect(xml).toContain('<staff>2</staff>');
  });

  it('keeps visible rests for piano silent gaps', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'piano',
        name: 'Piano',
        instrumentName: 'piano',
        notes: [
          { pitch: 64, onset: 0, offset: 0.5 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<rest/>');
  });

  it('lets piano notes absorb following silence within the same voice', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'piano',
        name: 'Piano',
        instrumentName: 'piano',
        notes: [
          { pitch: 64, onset: 0, offset: 0.5 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<duration>192</duration>');
  });

  it('shortens single-note piano figures for cleaner arpeggio-style notation', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'piano',
        name: 'Piano',
        instrumentName: 'piano',
        notes: [
          { pitch: 64, onset: 0, offset: 2.0 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).not.toContain('<tie type="start"/>');
  });

  it('shortens repeated single-note piano attacks to the next onset', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'piano',
        name: 'Piano',
        instrumentName: 'piano',
        notes: [
          { pitch: 64, onset: 0, offset: 1.5 },
          { pitch: 67, onset: 0.5, offset: 1.5 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<duration>48</duration>');
    expect(xml).toContain('<duration>144</duration>');
  });

  it('does not let bass attacks truncate treble notes during piano staff simplification', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'piano',
        name: 'Piano',
        instrumentName: 'piano',
        notes: [
          { pitch: 72, onset: 0, offset: 1.5 },
          { pitch: 43, onset: 0.5, offset: 1.0 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<duration>48</duration>');
  });

  it('adds beams for short-note runs within a beat', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'melody',
        name: 'Melody',
        instrumentName: 'melody',
        notes: [
          { pitch: 72, onset: 0, offset: 0.25 },
          { pitch: 74, onset: 0.25, offset: 0.5 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<beam number="1">begin</beam>');
    expect(xml).toContain('<beam number="1">end</beam>');
  });

  it('splits dotted short notes into tied subdivisions for cleaner beaming', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'melody',
        name: 'Melody',
        instrumentName: 'melody',
        notes: [
          { pitch: 72, onset: 0, offset: 0.375 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<duration>24</duration>');
    expect(xml).toContain('<duration>12</duration>');
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
  });

  it('drops a voice when it is silent for an entire measure', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'melody',
        name: 'Melody',
        instrumentName: 'melody',
        notes: [
          { pitch: 72, onset: 0, offset: 2.25 },
          { pitch: 74, onset: 0.25, offset: 0.75 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    const secondMeasure = xml.split('<measure number="2">')[1] ?? '';
    expect(secondMeasure).not.toContain('<voice>2</voice><type>whole</type>');
  });

  it('creates a melody score part from Sheet Sage note events', () => {
    const part = createScorePartDataFromSheetSage('melody', 'Melody', [
      { onset: 1.0, offset: 1.5, pitch: 72, velocity: 88 },
      { onset: 1.5, offset: 2.0, pitch: 74, velocity: 84 },
    ]);

    expect(part).toEqual({
      id: 'melody',
      name: 'Melody',
      instrumentName: 'melody',
      midiProgram: 41,
      notes: [
        { pitch: 72, onset: 1.0, offset: 1.5 },
        { pitch: 74, onset: 1.5, offset: 2.0 },
      ],
    });
  });

  it('adds tie markers when a note spans across measures', () => {
    const xml = exportScorePartsToMusicXml([
      {
        id: 'melody',
        name: 'Melody',
        instrumentName: 'melody',
        notes: [
          { pitch: 72, onset: 0, offset: 2.4 },
        ],
      },
    ], {
      bpm: 120,
      timeSignature: 4,
    });

    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
  });
});
