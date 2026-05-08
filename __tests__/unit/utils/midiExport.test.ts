import { exportChordEventsToMidi } from '@/utils/midiExport';
import { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import { parseChordToMidiNotes, type ChordEvent } from '@/utils/chordToMidi';
function countNoteOnEvents(midiBytes: Uint8Array, statusByte: number): number {
  let count = 0;
  for (let i = 0; i < midiBytes.length; i += 1) {
    if (midiBytes[i] === statusByte) {
      count += 1;
    }
  }
  return count;
}

function extractNoteOnVelocities(midiBytes: Uint8Array): number[] {
  const velocities: number[] = [];
  for (let i = 0; i < midiBytes.length - 2; i += 1) {
    if ((midiBytes[i] & 0xf0) === 0x90 && midiBytes[i + 2] > 0) {
      velocities.push(midiBytes[i + 2]);
    }
  }
  return velocities;
}

function countTrackChunks(midiBytes: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < midiBytes.length - 3; i += 1) {
    if (
      midiBytes[i] === 0x4d
      && midiBytes[i + 1] === 0x54
      && midiBytes[i + 2] === 0x72
      && midiBytes[i + 3] === 0x6b
    ) {
      count += 1;
    }
  }
  return count;
}

describe('midiExport dynamics integration', () => {
  it('passes total song duration into the dynamics analyzer for MIDI export', () => {
    const setParamsSpy = jest.spyOn(DynamicsAnalyzer.prototype, 'setParams');
    const events: ChordEvent[] = [
      { chordName: 'C', notes: parseChordToMidiNotes('C'), startTime: 0, endTime: 4, beatIndex: 0 },
      { chordName: 'F', notes: parseChordToMidiNotes('F'), startTime: 4, endTime: 8, beatIndex: 4 },
      { chordName: 'G', notes: parseChordToMidiNotes('G'), startTime: 8, endTime: 12, beatIndex: 8 },
    ];

    exportChordEventsToMidi(events, { bpm: 120, timeSignature: 4 });

    expect(setParamsSpy).toHaveBeenCalledWith({
      bpm: 120,
      timeSignature: 4,
      totalDuration: 12,
      segmentationData: undefined,
    });

    setParamsSpy.mockRestore();
  });

  it('passes segmentation data through to the export dynamics analyzer', () => {
    const setParamsSpy = jest.spyOn(DynamicsAnalyzer.prototype, 'setParams');
    const segmentationData = {
      segments: [{ label: 'Chorus', startTime: 0, endTime: 8 }],
      metadata: { totalDuration: 8 },
    } as any;
    const events: ChordEvent[] = [
      { chordName: 'C', notes: parseChordToMidiNotes('C'), startTime: 0, endTime: 4, beatIndex: 0 },
      { chordName: 'G', notes: parseChordToMidiNotes('G'), startTime: 4, endTime: 8, beatIndex: 4 },
    ];

    exportChordEventsToMidi(events, { bpm: 120, timeSignature: 4, segmentationData });

    expect(setParamsSpy).toHaveBeenCalledWith(expect.objectContaining({ segmentationData }));

    setParamsSpy.mockRestore();
  });

  it('encodes segmentation-driven dynamic loudness into exported MIDI note velocities', () => {
    const events: ChordEvent[] = [
      { chordName: 'C', notes: parseChordToMidiNotes('C'), startTime: 0, endTime: 2, beatIndex: 0 },
      { chordName: 'Am', notes: parseChordToMidiNotes('Am'), startTime: 2, endTime: 4, beatIndex: 4 },
      { chordName: 'F', notes: parseChordToMidiNotes('F'), startTime: 4, endTime: 6, beatIndex: 8 },
      { chordName: 'G', notes: parseChordToMidiNotes('G'), startTime: 6, endTime: 8, beatIndex: 12 },
      { chordName: 'C', notes: parseChordToMidiNotes('C'), startTime: 8, endTime: 10, beatIndex: 16 },
      { chordName: 'G', notes: parseChordToMidiNotes('G'), startTime: 10, endTime: 12, beatIndex: 20 },
    ];
    const segmentationData = {
      segments: [
        { label: 'Intro', startTime: 0, endTime: 2 },
        { label: 'Verse', startTime: 2, endTime: 6 },
        { label: 'Chorus', startTime: 6, endTime: 10 },
        { label: 'Outro', startTime: 10, endTime: 12 },
      ],
      metadata: { totalDuration: 12 },
    } as any;

    const baseMidi = exportChordEventsToMidi(events, {
      bpm: 120,
      timeSignature: 4,
      instruments: [{ name: 'piano', color: '#fff' }],
    });
    const segmentedMidi = exportChordEventsToMidi(events, {
      bpm: 120,
      timeSignature: 4,
      instruments: [{ name: 'piano', color: '#fff' }],
      segmentationData,
    });

    const baseVelocities = extractNoteOnVelocities(baseMidi);
    const segmentedVelocities = extractNoteOnVelocities(segmentedMidi);

    expect(segmentedVelocities.length).toBe(baseVelocities.length);
    expect(segmentedVelocities).not.toEqual(baseVelocities);
  });

  it('exports piano MIDI with the shared patterned scheduling instead of a single block chord', () => {
    const events: ChordEvent[] = [
      { chordName: 'C', notes: parseChordToMidiNotes('C'), startTime: 0, endTime: 2, beatIndex: 0 },
      { chordName: 'F', notes: parseChordToMidiNotes('F'), startTime: 2, endTime: 4, beatIndex: 4 },
      { chordName: 'G', notes: parseChordToMidiNotes('G'), startTime: 4, endTime: 6, beatIndex: 8 },
      { chordName: 'C', notes: parseChordToMidiNotes('C'), startTime: 6, endTime: 8, beatIndex: 12 },
      { chordName: 'Am', notes: parseChordToMidiNotes('Am'), startTime: 8, endTime: 10, beatIndex: 16 },
      { chordName: 'F', notes: parseChordToMidiNotes('F'), startTime: 10, endTime: 12, beatIndex: 20 },
      { chordName: 'Dm', notes: parseChordToMidiNotes('Dm'), startTime: 12, endTime: 14, beatIndex: 24 },
      { chordName: 'G', notes: parseChordToMidiNotes('G'), startTime: 14, endTime: 16, beatIndex: 28 },
    ];

    const midiBytes = exportChordEventsToMidi(events, {
      bpm: 120,
      timeSignature: 4,
      instruments: [{ name: 'piano', color: '#fff' }],
    });

    expect(countNoteOnEvents(midiBytes, 0x90)).toBeGreaterThanOrEqual(32);
  });

  it('exports the final piano endgame chord as a single sustained voicing from the shared generator', () => {
    const events: ChordEvent[] = [
      { chordName: 'C', notes: parseChordToMidiNotes('C'), startTime: 27, endTime: 32, beatIndex: 54 },
    ];

    const midiBytes = exportChordEventsToMidi(events, {
      bpm: 120,
      timeSignature: 4,
      instruments: [{ name: 'piano', color: '#fff' }],
    });

    expect(countNoteOnEvents(midiBytes, 0x90)).toBe(4);
  });

  it('adds a separate melody track when additional visualizer notes are exported', () => {
    const events: ChordEvent[] = [
      { chordName: 'C', notes: parseChordToMidiNotes('C'), startTime: 0, endTime: 2, beatIndex: 0 },
    ];

    const withoutMelody = exportChordEventsToMidi(events, {
      bpm: 120,
      timeSignature: 4,
      instruments: [{ name: 'piano', color: '#fff' }],
    });
    const withMelody = exportChordEventsToMidi(events, {
      bpm: 120,
      timeSignature: 4,
      instruments: [{ name: 'piano', color: '#fff' }],
      additionalTracks: [
        {
          name: 'Melody',
          program: 40,
          noteEvents: [{ onset: 0, offset: 1, pitch: 72, velocity: 96 }],
        },
      ],
    });

    expect(countTrackChunks(withoutMelody)).toBe(2);
    expect(countTrackChunks(withMelody)).toBe(3);
    expect(withMelody.length).toBeGreaterThan(withoutMelody.length);
  });
});
