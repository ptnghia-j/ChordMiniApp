import { quantizeAbsoluteNoteEvents } from '@/utils/musicXmlExport/notationQuantization';

describe('notationQuantization onset snapping', () => {
  it('snaps near half-beat onsets onto the same timing column across staves', () => {
    const quantized = quantizeAbsoluteNoteEvents([
      {
        pitch: 72,
        onset: 1,
        offset: 2,
        velocity: 96,
        chordName: 'Ebm7',
        chordStartTime: 1,
        chordEndTime: 2,
        beatIndex: 2,
        beatOnset: 2,
        beatOffset: 4,
        chordStartBeat: 2,
        chordEndBeat: 4,
        source: 'piano' as const,
        handHint: 'right' as const,
        staffHint: 1 as const,
      },
      {
        pitch: 48,
        onset: 1,
        offset: 2,
        velocity: 92,
        chordName: 'Ebm7',
        chordStartTime: 1,
        chordEndTime: 2,
        beatIndex: 2,
        beatOnset: 1.992063492063492,
        beatOffset: 3.992063492063492,
        chordStartBeat: 1.992063492063492,
        chordEndBeat: 3.992063492063492,
        source: 'piano' as const,
        handHint: 'left' as const,
        staffHint: 2 as const,
      },
    ], 'PPiano', {
      bpm: 120,
      timeSignature: 4,
      divisionsPerQuarter: 1260,
      allowMergedOnsets: false,
      preserveSourceOnsets: true,
    });

    const startsByPitch = new Map(quantized.map((event) => [event.pitch, event.startDivision]));

    expect(startsByPitch.get(72)).toBe(2520);
    expect(startsByPitch.get(48)).toBe(2520);
  });
});
