import { parseChordToMidiNotes } from '@/utils/chordToMidi';
import { generateNotesForInstrument, generateAllInstrumentVisualNotes } from '@/utils/instrumentNoteGeneration';
import { writeFileSync } from 'fs';

const baseParams = { chordName: 'C', chordNotes: parseChordToMidiNotes('C'), duration: 2, beatDuration: 0.5 };
const shortParams = { ...baseParams, duration: 1.5 };

const results: Record<string, unknown> = {};

results.fluteShort = generateNotesForInstrument('flute', shortParams).map(n => ({ name: n.noteName, offset: n.startOffset, dur: n.duration }));
results.fluteSlash = generateNotesForInstrument('flute', { ...shortParams, chordName: 'C/G', chordNotes: parseChordToMidiNotes('C/G') }).map(n => ({ name: n.noteName, offset: n.startOffset }));
results.fluteLong = generateNotesForInstrument('flute', baseParams).map(n => ({ name: n.noteName, offset: n.startOffset, vel: n.velocityMultiplier }));

const pianoLong = generateNotesForInstrument('piano', baseParams);
results.pianoLongC3 = pianoLong.filter(n => n.noteName === 'C3').map(n => n.startOffset);
results.pianoLongE4 = pianoLong.filter(n => n.noteName === 'E4').map(n => n.startOffset);
results.pianoLongAll = pianoLong.map(n => ({ name: n.noteName, offset: n.startOffset }));

const pianoSlash = generateNotesForInstrument('piano', { ...baseParams, chordName: 'C/G', chordNotes: parseChordToMidiNotes('C/G') });
results.pianoSlashG3 = pianoSlash.filter(n => n.noteName === 'G3').map(n => n.startOffset);
results.pianoSlashAll = pianoSlash.map(n => ({ name: n.noteName, offset: n.startOffset }));

const pianoShort = generateNotesForInstrument('piano', shortParams);
results.pianoShort = pianoShort.map(n => ({ name: n.noteName, offset: n.startOffset, dur: n.duration, vel: n.velocityMultiplier }));

const pianoResidue = generateNotesForInstrument('piano', { ...baseParams, duration: 2.01 });
results.pianoResidueOffsets = pianoResidue.map(n => n.startOffset);
results.pianoResidueMaxOffset = Math.max(...pianoResidue.map(n => n.startOffset));

const preEnding = generateNotesForInstrument('piano', { ...baseParams, duration: 4, startTime: 20, totalDuration: 32 });
results.preEndingC3 = preEnding.filter(n => n.noteName === 'C3').map(n => n.startOffset);

const sparse = generateNotesForInstrument('piano', { ...baseParams, duration: 4, startTime: 24, totalDuration: 32 });
results.sparseC3 = sparse.filter(n => n.noteName === 'C3').map(n => n.startOffset);
results.sparseAll = sparse.map(n => ({ name: n.noteName, offset: n.startOffset }));

const cross = generateNotesForInstrument('piano', { ...baseParams, duration: 4, startTime: 27, totalDuration: 32 });
results.crossC3 = cross.filter(n => n.noteName === 'C3').map(n => n.startOffset);
results.crossAll = cross.map(n => ({ name: n.noteName, offset: n.startOffset }));

const final = generateNotesForInstrument('piano', { ...baseParams, duration: 4, startTime: 28, totalDuration: 32 });
results.finalOffsets = final.map(n => n.startOffset);
results.finalNames = final.map(n => n.noteName);

const waltz = generateNotesForInstrument('piano', { ...baseParams, duration: 1.5, timeSignature: 3 });
results.waltzBass = waltz.filter(n => n.noteName === 'C3').map(n => n.startOffset);
results.waltzE4 = waltz.filter(n => n.noteName === 'E4').map(n => n.startOffset);
results.waltzAll = waltz.map(n => ({ name: n.noteName, offset: n.startOffset }));

const compound = generateNotesForInstrument('piano', { ...baseParams, duration: 3.0, timeSignature: 6 });
results.compoundBass = compound.filter(n => n.noteName === 'C3').map(n => n.startOffset);
results.compoundE4 = compound.filter(n => n.noteName === 'E4').map(n => n.startOffset);

const halfM = generateNotesForInstrument('piano', { ...baseParams, duration: 1.5, timeSignature: 6 });
results.halfMBass = halfM.filter(n => n.noteName === 'C3').map(n => n.startOffset);
results.halfME4 = halfM.filter(n => n.noteName === 'E4').map(n => n.startOffset);

const guitar44 = generateNotesForInstrument('guitar', {
  chordName: 'G', chordNotes: parseChordToMidiNotes('G'), duration: 2, beatDuration: 0.5,
  timeSignature: 4, guitarVoicing: { capoFret: 0, selectedPositions: { G: 0 } }, targetKey: 'C',
});
results.guitar44Count = guitar44.length;
results.guitar44First6 = guitar44.slice(0, 6).map(n => ({ name: n.noteName, offset: Number(n.startOffset.toFixed(3)) }));
results.guitar44_6 = guitar44[6] ? { name: guitar44[6].noteName, offset: guitar44[6].startOffset, vel: guitar44[6].velocityMultiplier } : null;
results.guitar44_12 = guitar44[12] ? { name: guitar44[12].noteName, offset: guitar44[12].startOffset } : null;

const guitar34 = generateNotesForInstrument('guitar', {
  chordName: 'G', chordNotes: parseChordToMidiNotes('G'), duration: 1.5, beatDuration: 0.5,
  timeSignature: 3, guitarVoicing: { capoFret: 0, selectedPositions: { G: 0 } }, targetKey: 'C',
});
results.guitar34Count = guitar34.length;
results.guitar34_12 = guitar34[12] ? { name: guitar34[12].noteName, offset: guitar34[12].startOffset } : null;

test('dump', () => {
  writeFileSync('/tmp/instr_diag.json', JSON.stringify(results, null, 2));
  expect(true).toBe(true);
});
