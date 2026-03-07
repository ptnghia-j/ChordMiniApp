/**
 * MIDI File Export Utility
 *
 * Generates a standard Type 1 MIDI (.mid) file from chord events.
 * Supports multi-track output with instrument-specific voicing patterns
 * matching the soundfontChordPlaybackService:
 *
 *   Piano (octave 3): Full chord, bass at octave 2 for inversions
 *   Guitar (octave 2-4): Arpeggiated (Root→Fifth→Third across octaves)
 *   Violin (octave 5): Root note only
 *   Flute (octave 4): Bass/root note only
 *   Bass (octave 1-2): Single low note (E-B → oct 1, C-D# → oct 2)
 *
 * Zero external dependencies – raw binary MIDI encoding.
 */

import type { ChordEvent } from './chordToMidi';
import { getDynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import {
  beatDurationFromBpm,
  generateNotesForInstrument,
  mergeConsecutiveChordEvents,
  type InstrumentName,
} from './instrumentNoteGeneration';

// ─── Constants ───────────────────────────────────────────────────────────────

const TICKS_PER_QUARTER = 480;

/** General MIDI program numbers */
const GM_PROGRAMS: Record<string, number> = {
  piano: 0,    // Acoustic Grand Piano
  guitar: 24,  // Nylon String Guitar
  violin: 40,  // Violin
  flute: 73,   // Flute
  bass: 33,    // Electric Bass (finger)
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface InstrumentConfig {
  name: string;
  color: string;
}

interface MidiNoteEvent {
  tick: number;
  midi: number;
  velocity: number;
  channel: number;
  isNoteOn: boolean;
}

// ─── Variable Length Quantity ─────────────────────────────────────────────────

function writeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  const bytes: number[] = [];
  bytes.unshift(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

// ─── Buffer Builder ──────────────────────────────────────────────────────────

class MidiBuffer {
  private data: number[] = [];

  writeString(s: string) {
    for (let i = 0; i < s.length; i++) {
      this.data.push(s.charCodeAt(i));
    }
  }

  writeUint32(v: number) {
    this.data.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
  }

  writeUint16(v: number) {
    this.data.push((v >> 8) & 0xff, v & 0xff);
  }

  writeBytes(bytes: number[] | Uint8Array) {
    if (bytes instanceof Uint8Array) {
      for (let i = 0; i < bytes.length; i++) this.data.push(bytes[i]);
    } else {
      this.data.push(...bytes);
    }
  }

  getLength() {
    return this.data.length;
  }

  toUint8Array() {
    return new Uint8Array(this.data);
  }
}

// ─── Track Building ──────────────────────────────────────────────────────────

function buildTrackChunk(
  events: MidiNoteEvent[],
  channel: number,
  program?: number,
  trackName?: string,
): Uint8Array {
  const td = new MidiBuffer();

  // Track name meta event
  if (trackName) {
    td.writeBytes(writeVLQ(0));
    td.writeBytes([0xff, 0x03]);
    const nameBytes = [...trackName].map(c => c.charCodeAt(0));
    td.writeBytes(writeVLQ(nameBytes.length));
    td.writeBytes(nameBytes);
  }

  // Program change
  if (program !== undefined) {
    td.writeBytes(writeVLQ(0));
    td.writeBytes([0xc0 | (channel & 0x0f), program & 0x7f]);
  }

  // Sort events: by tick, then note-off before note-on at same tick
  const sorted = [...events].sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (!a.isNoteOn && b.isNoteOn) return -1;
    if (a.isNoteOn && !b.isNoteOn) return 1;
    return 0;
  });

  let lastTick = 0;
  for (const evt of sorted) {
    const delta = Math.max(0, evt.tick - lastTick);
    td.writeBytes(writeVLQ(delta));

    if (evt.isNoteOn) {
      td.writeBytes([0x90 | (channel & 0x0f), evt.midi & 0x7f, evt.velocity & 0x7f]);
    } else {
      td.writeBytes([0x80 | (channel & 0x0f), evt.midi & 0x7f, 0]);
    }

    lastTick = evt.tick;
  }

  // End of track
  td.writeBytes([...writeVLQ(0), 0xff, 0x2f, 0x00]);

  // Wrap in MTrk chunk
  const chunk = new MidiBuffer();
  chunk.writeString('MTrk');
  chunk.writeUint32(td.getLength());
  chunk.writeBytes(td.toUint8Array());

  return chunk.toUint8Array();
}

function buildTempoTrack(bpm: number, timeSignature: number = 4): Uint8Array {
  const td = new MidiBuffer();

  // Track name
  td.writeBytes(writeVLQ(0));
  td.writeBytes([0xff, 0x03]);
  const name = 'Tempo';
  td.writeBytes(writeVLQ(name.length));
  td.writeBytes([...name].map(c => c.charCodeAt(0)));

  // Tempo: microseconds per quarter note
  const uspq = Math.round(60_000_000 / bpm);
  td.writeBytes(writeVLQ(0));
  td.writeBytes([0xff, 0x51, 0x03]);
  td.writeBytes([(uspq >> 16) & 0xff, (uspq >> 8) & 0xff, uspq & 0xff]);

  // Time signature: numerator/4  (denominator power = 2 → quarter note)
  td.writeBytes(writeVLQ(0));
  td.writeBytes([0xff, 0x58, 0x04, timeSignature, 2, 24, 8]);

  // End of track
  td.writeBytes([...writeVLQ(0), 0xff, 0x2f, 0x00]);

  const chunk = new MidiBuffer();
  chunk.writeString('MTrk');
  chunk.writeUint32(td.getLength());
  chunk.writeBytes(td.toUint8Array());

  return chunk.toUint8Array();
}

// ─── Instrument Voicing ──────────────────────────────────────────────────────

function secondsToTicks(seconds: number, bpm: number): number {
  return Math.round(seconds * (bpm / 60) * TICKS_PER_QUARTER);
}

function getSongDurationFromEvents(events: ChordEvent[]): number | undefined {
  if (events.length === 0) return undefined;
  return events.reduce((maxDuration, event) => Math.max(maxDuration, event.endTime), 0);
}

function generateInstrumentMidiNotes(
  events: ChordEvent[],
  instrumentName: string,
  bpm: number,
  channel: number,
  timeSignature: number = 4,
): MidiNoteEvent[] {
  const midiEvents: MidiNoteEvent[] = [];
  const BASE_VELOCITY = 80;

  // Merge consecutive same-chord beats so MIDI only triggers on chord changes
  const merged = mergeConsecutiveChordEvents(events);
  const totalSongDuration = getSongDurationFromEvents(merged);

  // Set up dynamics analyzer for export context
  const dynamics = getDynamicsAnalyzer();
  dynamics.setParams({
    bpm,
    timeSignature,
    totalDuration: getSongDurationFromEvents(merged),
  });

  const beatDuration = beatDurationFromBpm(bpm);

  for (const event of merged) {
    const { notes: chordNotes, startTime, endTime, chordName } = event;
    const duration = endTime - startTime;

    // Compute dynamic velocity for this chord event
    const estimatedBeatIndex = Math.round(startTime / beatDuration);
    const dynamicMultiplier = dynamics.getExportVelocity(startTime, estimatedBeatIndex, chordName);
    const scheduledNotes = generateNotesForInstrument(instrumentName as InstrumentName, {
      chordName,
      chordNotes,
      duration,
      beatDuration,
      startTime,
      totalDuration: totalSongDuration,
      timeSignature,
    });

    for (const scheduledNote of scheduledNotes) {
      const velocity = Math.max(
        1,
        Math.min(127, Math.round(BASE_VELOCITY * dynamicMultiplier * scheduledNote.velocityMultiplier)),
      );
      const midi = scheduledNote.midi;
      if (midi < 0 || midi > 127) continue;
      const startTick = secondsToTicks(startTime + scheduledNote.startOffset, bpm);
      const endTick = secondsToTicks(startTime + scheduledNote.startOffset + scheduledNote.duration, bpm);

      midiEvents.push({ tick: startTick, midi, velocity, channel, isNoteOn: true });
      midiEvents.push({ tick: endTick, midi, velocity: 0, channel, isNoteOn: false });
    }
  }

  return midiEvents;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface MidiExportOptions {
  /** Instruments to create tracks for (default: single piano track) */
  instruments?: InstrumentConfig[];
  /** Time signature numerator (default: 4 for 4/4) */
  timeSignature?: number;
  /** Explicit BPM — if omitted, estimated from average beat duration */
  bpm?: number;
}

/**
 * Estimate BPM from average beat duration across chord events.
 * Clamps result to 40–300 BPM range.
 */
function estimateBpmFromEvents(events: ChordEvent[]): number {
  let totalDuration = 0;
  let beatCount = 0;
  for (const event of events) {
    const dur = event.endTime - event.startTime;
    if (dur > 0 && dur < 5) {
      totalDuration += dur;
      beatCount++;
    }
  }
  const avgBeatDuration = beatCount > 0 ? totalDuration / beatCount : 0.5;
  return Math.max(40, Math.min(300, Math.round(60 / avgBeatDuration)));
}

/**
 * Export chord events to a MIDI file as a Uint8Array.
 *
 * When `instruments` are provided, each instrument gets its own MIDI track
 * with voicing patterns matching the chord playback service. Otherwise, a
 * single piano track is created with the base chord notes.
 *
 * Pass `bpm` explicitly for best accuracy (uses beat detection result).
 * If omitted, BPM is estimated from average beat duration.
 *
 * NOTE: Some MIDI editors (e.g. MuseScore 4) have a "Detect time signature"
 * import option that may override the MIDI time-signature meta-event based
 * on note patterns.  Uncheck that option in the import dialog to honour the
 * embedded 4/4 (or other) time signature.
 */
export function exportChordEventsToMidi(
  events: ChordEvent[],
  options?: MidiExportOptions,
): Uint8Array {
  if (events.length === 0) return new Uint8Array(0);

  const timeSignature = options?.timeSignature ?? 4;
  const bpm = options?.bpm ?? estimateBpmFromEvents(events);

  const instrumentList =
    options?.instruments && options.instruments.length > 0
      ? options.instruments
      : [{ name: 'piano', color: '#60a5fa' }];

  const numTracks = 1 + Math.min(instrumentList.length, 15);

  // Header chunk
  const header = new MidiBuffer();
  header.writeString('MThd');
  header.writeUint32(6);
  header.writeUint16(1); // format 1
  header.writeUint16(numTracks);
  header.writeUint16(TICKS_PER_QUARTER);

  // Tempo track
  const tempoTrack = buildTempoTrack(bpm, timeSignature);

  // Instrument tracks (MIDI supports channels 0-15; channel 9 is reserved for GM drums)
  if (typeof console !== 'undefined') {
    console.info(`MIDI export: BPM=${bpm}, time signature=${timeSignature}/4, tracks=${numTracks}`);
  }

  if (instrumentList.length > 15) {
    console.warn(`MIDI export: ${instrumentList.length} instruments requested but only 15 channels available (channel 9 reserved for drums). Extra instruments will be ignored.`);
  }
  const instrumentTracks: Uint8Array[] = instrumentList.slice(0, 15).map((inst, idx) => {
    const channel = idx >= 9 ? idx + 1 : idx; // skip channel 9 (GM drums)
    const program = GM_PROGRAMS[inst.name.toLowerCase()] ?? 0;
    const midiNotes = generateInstrumentMidiNotes(events, inst.name.toLowerCase(), bpm, channel, timeSignature);
    const displayName = inst.name.charAt(0).toUpperCase() + inst.name.slice(1);
    return buildTrackChunk(midiNotes, channel, program, displayName);
  });

  // Combine all chunks
  const headerBytes = header.toUint8Array();
  const totalBytes = headerBytes.length + tempoTrack.length +
    instrumentTracks.reduce((sum, t) => sum + t.length, 0);
  const result = new Uint8Array(totalBytes);
  let offset = 0;

  result.set(headerBytes, offset);
  offset += headerBytes.length;
  result.set(tempoTrack, offset);
  offset += tempoTrack.length;
  for (const track of instrumentTracks) {
    result.set(track, offset);
    offset += track.length;
  }

  return result;
}

/**
 * Download a MIDI file to the user's device.
 */
export function downloadMidiFile(
  data: Uint8Array,
  filename: string = 'chord-progression.mid',
): void {
  // Cast to ArrayBuffer for Blob compatibility (TypeScript strict mode)
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
