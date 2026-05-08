import type { SheetSageNoteEvent } from '@/types/sheetSage';
import { exportLeadSheetToMusicXml } from '@/utils/musicXmlExport';

function getMeasureXml(xml: string, measureNumber: number): string {
  const pattern = new RegExp(`<measure number="${measureNumber}"(?:\\s+implicit="yes")?>([\\s\\S]*?)</measure>`);
  return xml.match(pattern)?.[1] ?? '';
}

function getSyncData(xml: string): {
  selectedAnacrusisDivisions?: number;
  selectedAnacrusisSeconds?: number;
  measureStartScoreTimes?: number[];
  measureStartAudioTimes?: number[];
} {
  const match = xml.match(/chordmini-sync-data:([\s\S]*?)-->/i);
  return JSON.parse(match?.[1]?.trim() ?? '{}');
}

describe('musicXmlExport lead-sheet bar alignment', () => {
  const leadInNote: SheetSageNoteEvent[] = [
    {
      onset: 3,
      offset: 4,
      pitch: 67,
      velocity: 90,
    },
  ];

  test('anacrusis candidate search uses eighth-note steps and emits pickup metadata', () => {
    const optimizedXml = exportLeadSheetToMusicXml(leadInNote, [], {
      bpm: 120,
      timeSignature: 4,
    });
    const syncData = getSyncData(optimizedXml);

    expect(syncData.selectedAnacrusisDivisions).toBeGreaterThan(0);
    expect((syncData.selectedAnacrusisDivisions ?? 0) % 12).toBe(0);
    expect(syncData.measureStartScoreTimes?.length).toBeGreaterThan(0);
    expect(syncData.measureStartScoreTimes?.[1]).toBeCloseTo(syncData.selectedAnacrusisSeconds ?? 0, 6);
    expect(syncData.measureStartAudioTimes?.[1]).toBeCloseTo(syncData.selectedAnacrusisSeconds ?? 0, 6);
    expect(optimizedXml).toContain('<measure number="1" implicit="yes">');
  });

  test('disabling anacrusis search keeps the original full-measure lead-in layout', () => {
    const baselineXml = exportLeadSheetToMusicXml(leadInNote, [], {
      bpm: 120,
      timeSignature: 4,
      enableLeadingSilenceAnacrusisSearch: false,
    });

    const optimizedXml = exportLeadSheetToMusicXml(leadInNote, [], {
      bpm: 120,
      timeSignature: 4,
    });

    const baselineTieStarts = baselineXml.match(/<tie type="start"\/>/g)?.length ?? 0;
    const optimizedTieStarts = optimizedXml.match(/<tie type="start"\/>/g)?.length ?? 0;
    const tieGap = optimizedTieStarts - baselineTieStarts;
    const tieGapTolerance = Math.max(12, Math.ceil(baselineTieStarts * 0.06));

    expect(baselineXml).not.toContain('implicit="yes"');
    expect(optimizedXml).toContain('implicit="yes"');
    expect(tieGap).toBeLessThanOrEqual(tieGapTolerance);

    const baselineMeasure1 = getMeasureXml(baselineXml, 1);
    expect(baselineMeasure1).toContain('<rest/><duration>96</duration>');
  });
});
