import { extractSyncDataFromMusicXml } from '@/components/piano-visualizer/sheet-music-display/sync';
import { exportPianoVisualizerScoreToMusicXml } from '@/utils/musicXmlExport';
import { GENERIC_DIVISIONS_PER_QUARTER } from '@/utils/musicXmlExport/constants';

describe('exportPianoVisualizerScoreToMusicXml', () => {
  it('renders an explicit pickup measure and aligned sync metadata', () => {
    const aMajorNotes = [
      { name: 'A3', noteName: 'A', octave: 3, midi: 57 },
      { name: 'C#4', noteName: 'C#', octave: 4, midi: 61 },
      { name: 'E4', noteName: 'E', octave: 4, midi: 64 },
    ];
    const eMajorNotes = [
      { name: 'E3', noteName: 'E', octave: 3, midi: 52 },
      { name: 'G#3', noteName: 'G#', octave: 3, midi: 56 },
      { name: 'B3', noteName: 'B', octave: 3, midi: 59 },
    ];

    const musicXml = exportPianoVisualizerScoreToMusicXml({
      bpm: 60,
      timeSignature: 4,
      pickupBeatCount: 1,
      melodyBeatTimes: [0, 1, 2, 3, 4, 5],
      chordEvents: [
        {
          chordName: 'A:maj',
          startTime: 0,
          endTime: 1,
          beatIndex: 0,
          beatCount: 1,
          notes: aMajorNotes,
        },
        {
          chordName: 'E:maj',
          startTime: 1,
          endTime: 5,
          beatIndex: 1,
          beatCount: 4,
          notes: eMajorNotes,
        },
      ],
    });

    const syncData = extractSyncDataFromMusicXml(musicXml);
    const syncMatch = musicXml.match(/chordmini-sync-data:([\s\S]*?)-->/i);
    const syncMetadata = syncMatch ? JSON.parse(syncMatch[1].trim()) : null;

    expect(musicXml).toContain('<measure number="1" implicit="yes">');
    expect(syncData.measureStartScoreTimes.slice(0, 2)).toEqual([0, 1]);
    expect(syncData.measureStartAudioTimes.slice(0, 2)).toEqual([0, 1]);
    expect(syncMetadata?.selectedAnacrusisDivisions).toBe(GENERIC_DIVISIONS_PER_QUARTER);
  });
});
