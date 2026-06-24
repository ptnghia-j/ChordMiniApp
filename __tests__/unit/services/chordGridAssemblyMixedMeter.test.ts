import { getChordGridData } from '@/services/chord-analysis/gridAssembly';
import fs from 'fs';
import path from 'path';

describe('chordGridAssemblyMixedMeter regression guards', () => {
  it('correctly places the 3/4 boundary at index 78 for aCofb-qQxKc (This Wish)', () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'aCofb-qQxKc.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const result = getChordGridData(data);

    // Verify metric segments structure
    expect(result.metricSegments).toBeDefined();
    
    // Find the 3/4 segment
    const seg34 = result.metricSegments?.find((s) => s.beatsPerMeasure === 3);
    expect(seg34).toBeDefined();
    
    // The start of the 3/4 segment should be exactly at index 78
    expect(seg34?.startIndex).toBe(78);
    expect(seg34?.endIndex).toBe(132);
    
    // Let's also check the next 4/4 segment
    const seg44 = result.metricSegments?.find((s, index) => index === 2);
    expect(seg44?.beatsPerMeasure).toBe(4);
    expect(seg44?.startIndex).toBe(132);
    expect(seg44?.endIndex).toBe(224);
  });

  it('correctly maps mixed meters for exxyRUGoudU (Medley) using preliminary segments fallback', () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'exxyRUGoudU.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const result = getChordGridData(data);

    // Verify metric segments are present and have mixed meters
    expect(result.metricSegments).toBeDefined();
    expect(result.metricSegments!.length).toBeGreaterThanOrEqual(2);

    // The medley switches between 4/4 and 3/4
    const meters = result.metricSegments!.map((s) => s.beatsPerMeasure);
    expect(meters).toContain(3);
    expect(meters).toContain(4);
  });
});
