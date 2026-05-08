import { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';

function createMockAudioBuffer(duration: number, sampleRate: number = 100): AudioBuffer {
  const totalSamples = Math.max(1, Math.floor(duration * sampleRate));
  const channelData = new Float32Array(totalSamples).fill(0.1);

  return {
    sampleRate,
    duration,
    getChannelData: jest.fn(() => channelData),
  } as unknown as AudioBuffer;
}

function getSectionContour(analyzer: DynamicsAnalyzer, time: number): number {
  return (analyzer as any).getSectionDynamicContour(time);
}

describe('DynamicsAnalyzer macro contour', () => {
  let analyzer: DynamicsAnalyzer;

  beforeEach(() => {
    analyzer = new DynamicsAnalyzer();
  });

  it('ramps up from a softer intro, stays full in the middle, and tapers in the outro', () => {
    analyzer.setParams({ bpm: 120, timeSignature: 4, totalDuration: 100 });

    const introStart = analyzer.getVelocityMultiplier(0);
    const introMid = analyzer.getVelocityMultiplier(6);
    const middle = analyzer.getVelocityMultiplier(50);
    const outroMid = analyzer.getVelocityMultiplier(94);
    const outroEnd = analyzer.getVelocityMultiplier(100);

    expect(introStart).toBeCloseTo(0.75 * 0.88, 2);
    expect(outroEnd).toBeCloseTo(0.75 * 0.88, 2);
    expect(introStart).toBeLessThan(introMid);
    expect(introMid).toBeLessThan(middle);
    expect(outroMid).toBeLessThan(middle);
    expect(outroEnd).toBeLessThan(outroMid);
    expect(Math.abs(introMid - introStart)).toBeLessThan(0.2);
    expect(Math.abs(outroMid - outroEnd)).toBeLessThan(0.2);
  });

  it('uses analyzed audio duration as a macro-contour fallback in audio-aware mode', () => {
    analyzer.analyzeBuffer(createMockAudioBuffer(10));

    const intro = analyzer.getVelocityMultiplier(0);
    const middle = analyzer.getVelocityMultiplier(5);
    const outro = analyzer.getVelocityMultiplier(10);

    expect(intro).toBeLessThan(middle);
    expect(outro).toBeLessThan(middle);
  });

  it('applies the same macro contour to export velocity calculations', () => {
    analyzer.setParams({ bpm: 120, timeSignature: 4, totalDuration: 16 });

    const intro = analyzer.getExportVelocity(1, 1, 'C');
    const middle = analyzer.getExportVelocity(8, 1, 'C');
    const outro = analyzer.getExportVelocity(15, 1, 'C');

    expect(intro).toBeLessThan(middle);
    expect(outro).toBeLessThan(middle);
  });

  it('shapes dynamics by segmentation with a later second-half chorus peak and outro taper', () => {
    analyzer.setParams({
      bpm: 120,
      timeSignature: 4,
      totalDuration: 120,
      segmentationData: {
        segments: [
          { label: 'Intro', startTime: 0, endTime: 12 },
          { label: 'Verse 1', startTime: 12, endTime: 36 },
          { label: 'Chorus 1', startTime: 36, endTime: 52 },
          { label: 'Bridge', startTime: 52, endTime: 72 },
          { label: 'Chorus 2', startTime: 72, endTime: 98 },
          { label: 'Outro', startTime: 98, endTime: 120 },
        ],
        metadata: { totalDuration: 120 },
      } as any,
    });

    const intro = analyzer.getVelocityMultiplier(6, 0, 'C');
    const verse = analyzer.getVelocityMultiplier(24, 4, 'Am');
    const firstChorus = analyzer.getVelocityMultiplier(44, 12, 'F');
    const bridge = analyzer.getVelocityMultiplier(62, 16, 'Dm');
    const finalChorus = analyzer.getVelocityMultiplier(86, 24, 'G');
    const outro = analyzer.getVelocityMultiplier(114, 28, 'C');

    expect(intro).toBeLessThan(verse);
    expect(verse).toBeLessThan(firstChorus);
    expect(bridge).toBeLessThan(firstChorus);
    expect(firstChorus).toBeLessThan(finalChorus);
    expect(outro).toBeLessThan(finalChorus);
  });

  it('creates a clearer long-form rise into the chorus and decay through the outro', () => {
    analyzer.setParams({
      bpm: 120,
      timeSignature: 4,
      totalDuration: 100,
      segmentationData: {
        segments: [
          { label: 'Intro', startTime: 0, endTime: 12 },
          { label: 'Verse 1', startTime: 12, endTime: 36 },
          { label: 'Pre-Chorus', startTime: 36, endTime: 50 },
          { label: 'Chorus', startTime: 50, endTime: 74 },
          { label: 'Outro', startTime: 74, endTime: 100 },
        ],
        metadata: { totalDuration: 100 },
      } as any,
    });

    const verseEarly = getSectionContour(analyzer, 18);
    const verseLate = getSectionContour(analyzer, 30);
    const preChorusLate = getSectionContour(analyzer, 47);
    const chorusPeak = getSectionContour(analyzer, 62);
    const outroEntry = getSectionContour(analyzer, 82);
    const outroTail = getSectionContour(analyzer, 97);

    expect(verseEarly).toBeLessThan(verseLate);
    expect(verseLate).toBeLessThan(preChorusLate);
    expect(preChorusLate).toBeLessThan(chorusPeak);
    expect(chorusPeak - verseEarly).toBeGreaterThan(0.09);
    expect(outroEntry).toBeLessThan(chorusPeak);
    expect(outroTail).toBeLessThan(outroEntry);
  });

  it('keeps section transitions smooth instead of stepping abruptly at boundaries', () => {
    analyzer.setParams({
      bpm: 120,
      timeSignature: 4,
      totalDuration: 100,
      segmentationData: {
        segments: [
          { label: 'Verse 1', startTime: 0, endTime: 28 },
          { label: 'Pre-Chorus', startTime: 28, endTime: 44 },
          { label: 'Chorus', startTime: 44, endTime: 70 },
          { label: 'Outro', startTime: 70, endTime: 100 },
        ],
        metadata: { totalDuration: 100 },
      } as any,
    });

    const verseToPre = [27.5, 28, 28.5].map((time) => getSectionContour(analyzer, time));
    const chorusToOutro = [69.5, 70, 70.5].map((time) => getSectionContour(analyzer, time));

    expect(verseToPre[0]).toBeLessThanOrEqual(verseToPre[1]);
    expect(verseToPre[1]).toBeLessThanOrEqual(verseToPre[2]);
    expect(verseToPre[2] - verseToPre[0]).toBeLessThan(0.03);

    expect(chorusToOutro[0]).toBeGreaterThanOrEqual(chorusToOutro[1]);
    expect(chorusToOutro[1]).toBeGreaterThanOrEqual(chorusToOutro[2]);
    expect(chorusToOutro[0] - chorusToOutro[2]).toBeLessThan(0.03);
  });
});