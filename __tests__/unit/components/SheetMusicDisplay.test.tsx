import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  default as SheetMusicDisplay,
  countScoreMeasuresInMusicXml,
  expandMeasureBoxesToMeasureSpans,
  extractSyncDataFromMusicXml,
  resolveMeasureScrollTop,
  stabilizeMeasureBoxAnchors,
} from '@/components/piano-visualizer/SheetMusicDisplay';
import { getActiveMeasureIndexFromAudioTime } from '@/components/piano-visualizer/sheet-music-display/sync';
import { exportPianoVisualizerScoreToMusicXml } from '@/utils/musicXmlExport';

describe('SheetMusicDisplay sync helpers', () => {
  it('shows a skeleton placeholder while the sheet is computing', () => {
    render(
      <SheetMusicDisplay
        musicXml=""
        isComputing
      />,
    );

    expect(screen.getByTestId('sheet-music-loading-skeleton')).toBeInTheDocument();
    expect(screen.getByText('Preparing Sheet Music')).toBeInTheDocument();
  });

  it('counts actual score measures instead of double-counting measure tags across multiple parts', () => {
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
          chordName: 'F',
          startTime: 2,
          endTime: 4,
          beatIndex: 4,
          beatCount: 4,
          notes: [
            { name: 'F2', noteName: 'F', octave: 2, midi: 41 },
            { name: 'F4', noteName: 'F', octave: 4, midi: 65 },
            { name: 'A4', noteName: 'A', octave: 4, midi: 69 },
            { name: 'C5', noteName: 'C', octave: 5, midi: 72 },
          ],
        },
      ],
      melodyNoteEvents: [
        { onset: 0, offset: 0.5, pitch: 72, velocity: 90 },
        { onset: 2, offset: 2.5, pitch: 74, velocity: 90 },
      ],
      bpm: 120,
      timeSignature: 4,
    });
    const syncData = extractSyncDataFromMusicXml(xml);
    const rawMeasureTagCount = xml.match(/<measure\b/g)?.length ?? 0;

    expect(rawMeasureTagCount).toBe(4);
    expect(countScoreMeasuresInMusicXml(xml, syncData)).toBe(2);
    expect(countScoreMeasuresInMusicXml(xml.replace(/<!--[\s\S]*?-->/, ''))).toBe(2);
  });

  it('reuses cached sync data for repeated playback-time lookups on the same score', () => {
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

    const first = extractSyncDataFromMusicXml(xml);
    const second = extractSyncDataFromMusicXml(xml);

    expect(second).toBe(first);
  });

  it('interpolates non-advancing same-system measure anchors instead of reusing the previous box', () => {
    const stabilized = stabilizeMeasureBoxAnchors([
      { top: 0, left: 100, width: 30, height: 60 },
      { top: 0, left: 100, width: 30, height: 60 },
      { top: 0, left: 220, width: 30, height: 60 },
    ], 3);

    expect(stabilized).toHaveLength(3);
    expect(stabilized[1].left).toBeGreaterThan(stabilized[0].left);
    expect(stabilized[1].left).toBeLessThan(stabilized[2].left);
  });

  it('uses score-time starts when leading padding stretches an exported pickup measure', () => {
    const syncData = {
      selectedAnacrusisSeconds: 3,
      measureStartScoreTimes: [0, 3, 7, 11],
      measureStartAudioTimes: [0, 12, 16, 20],
    };

    expect(getActiveMeasureIndexFromAudioTime(2.99, syncData, 60, 4)).toBe(0);
    expect(getActiveMeasureIndexFromAudioTime(3, syncData, 60, 4)).toBe(1);
    expect(getActiveMeasureIndexFromAudioTime(7, syncData, 60, 4)).toBe(2);
  });

  it('expands measure highlight boxes to the next same-system measure boundary', () => {
    const expanded = expandMeasureBoxesToMeasureSpans([
      { top: 0, left: 100, width: 12, height: 80 },
      { top: 0, left: 240, width: 120, height: 80 },
      { top: 180, left: 90, width: 18, height: 80 },
    ], 600);

    expect(expanded[0].width).toBe(140);
    expect(expanded[1].width).toBe(360);
    expect(expanded[2].width).toBe(510);
  });

  it('scrolls farther down for tall grand-staff systems so the bass staff remains visible', () => {
    const target = resolveMeasureScrollTop({
      activeMeasureBox: {
        top: 540,
        left: 120,
        width: 180,
        height: 220,
      },
      currentScrollTop: 360,
      viewportHeight: 420,
      scrollHeight: 1600,
    });

    expect(target).not.toBeNull();
    expect(target ?? 0).toBeGreaterThan(360);
    expect(target ?? 0).toBeCloseTo(506.4, 1);
  });

  it('does not scroll when the active measure is already fully visible', () => {
    const target = resolveMeasureScrollTop({
      activeMeasureBox: {
        top: 540,
        left: 120,
        width: 180,
        height: 220,
      },
      currentScrollTop: 390,
      viewportHeight: 420,
      scrollHeight: 1600,
    });

    expect(target).toBeNull();
  });
});
