/**
 * Lightweight Chord Playback Service
 * Uses Web Audio API directly instead of Tone.js + smplr for better performance
 * No external soundfont dependencies - generates synthetic sounds
 */

// Debug helper available across this module
function audioDebug(): boolean {
  try {
    return typeof window !== 'undefined' && localStorage.getItem('audioDebug') === '1';
  } catch {
    return false;
  }
}

const NOTE_FREQUENCIES: Record<string, number> = {
  'C': 261.63, 'C#': 277.18, 'Db': 277.18,
  'D': 293.66, 'D#': 311.13, 'Eb': 311.13,
  'E': 329.63,
  'F': 349.23, 'F#': 369.99, 'Gb': 369.99,
  'G': 392.00, 'G#': 415.30, 'Ab': 415.30,
  'A': 440.00, 'A#': 466.16, 'Bb': 466.16,
  'B': 493.88
};

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_INDEX_MAP: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

const CHORD_STRUCTURES: Record<string, number[]> = {
  major:    [0, 4, 7],
  minor:    [0, 3, 7],
  dom7:     [0, 4, 7, 10],
  maj7:     [0, 4, 7, 11],
  min7:     [0, 3, 7, 10],
  sus2:     [0, 2, 7],
  sus4:     [0, 5, 7],
  dim:      [0, 3, 6],
  aug:      [0, 4, 8],
  dim7:     [0, 3, 6, 9],
  hdim7:    [0, 3, 6, 10],
  add9:     [0, 4, 7, 14],
  dom9:     [0, 4, 7, 10, 14],
  maj9:     [0, 4, 7, 11, 14],
  min9:     [0, 3, 7, 10, 14],
  dom11:    [0, 4, 7, 10, 14, 17],
  dom13:    [0, 4, 7, 10, 14, 21],
  six:      [0, 4, 7, 9],
  min6:     [0, 3, 7, 9]
};

const CHORD_TYPE_ALIASES: Record<string, string> = {
  '': 'major', 'maj': 'major', 'major': 'major',
  'm': 'minor', 'min': 'minor', 'minor': 'minor',
  '7': 'dom7', 'dom7': 'dom7',
  'M7': 'maj7', 'maj7': 'maj7', 'Maj7': 'maj7',
  'm7': 'min7', 'min7': 'min7',
  'sus2': 'sus2',
  'sus4': 'sus4',
  '°': 'dim', 'dim': 'dim',
  '+': 'aug', 'aug': 'aug',
  '°7': 'dim7', 'dim7': 'dim7',
  'ø7': 'hdim7', 'hdim7': 'hdim7', 'm7b5': 'hdim7',
  'add9': 'add9',
  '9': 'dom9', 'dom9': 'dom9',
  'M9': 'maj9', 'maj9': 'maj9', 'Maj9': 'maj9',
  'm9': 'min9', 'min9': 'min9',
  '11': 'dom11', 'dom11': 'dom11',
  '13': 'dom13', 'dom13': 'dom13',
  '6': 'six',
  'm6': 'min6', 'min6': 'min6'
};

interface ChordNote {
  frequency: number;
  isBass: boolean;
}

function generateChordFrequencies(root: string, chordType: string, bassNote?: string): ChordNote[] {
  const rootIndex = NOTE_INDEX_MAP[root];
  if (rootIndex === undefined) return [];
  const cleanedType = chordType.replace(/^[^A-Za-z0-9#b]+/, '').replace(/\s+/g, '');
  const normalizedChordType = CHORD_TYPE_ALIASES[cleanedType.toLowerCase()] || 'major';
  const intervals = CHORD_STRUCTURES[normalizedChordType];
  if (!intervals) return [];

  const rootPositionNoteNames = intervals.map(interval => {
    const noteIndex = (rootIndex + interval) % 12;
    return CHROMATIC_SCALE[noteIndex];
  });

  const outputNotes: ChordNote[] = [];
  const isRootPosition = !bassNote || bassNote === rootPositionNoteNames[0];

  if (audioDebug()) {
    console.log('[AudioDebug] generateChordFrequencies input', { root, chordType, bassNote, normalizedChordType, rootPositionNoteNames, isRootPosition });
  }

  if (isRootPosition) {
    // Root position: no bass note, all notes at normal frequencies
    rootPositionNoteNames.forEach(noteName => {
      const frequency = NOTE_FREQUENCIES[noteName];
      if (frequency) {
        outputNotes.push({ frequency, isBass: false });
      }
    });
  } else {
    // Inversion: add bass note first in C2-B2 range, then other chord tones
    const bassFrequency = bassNote ? NOTE_FREQUENCIES[bassNote] : undefined;
    if (bassFrequency) {
      // Add bass note in C2-B2 range (two octaves lower)
      outputNotes.push({
        frequency: bassFrequency * 0.25,
        isBass: true
      });
    }

    // Add remaining chord tones (excluding the bass note)
    const otherNotes = rootPositionNoteNames.filter(note => note !== bassNote);
    otherNotes.forEach(noteName => {
      const frequency = NOTE_FREQUENCIES[noteName];
      if (frequency) {
        outputNotes.push({ frequency, isBass: false });
      }
    });
  }

  if (audioDebug()) {
    console.log('[AudioDebug] generateChordFrequencies output', outputNotes);
  }

  return outputNotes;
}

export interface LightweightChordPlaybackOptions {
  pianoVolume: number;
  guitarVolume: number;
  violinVolume?: number; // Optional for backward compatibility (not used in lightweight service)
  fluteVolume?: number; // Optional for backward compatibility (not used in lightweight service)
  enabled: boolean;
}

export class LightweightChordPlaybackService {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private currentChord: string | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private debugEnabled = false;
  private options: LightweightChordPlaybackOptions = {
    pianoVolume: 50,
    guitarVolume: 30,
    enabled: false
  };

  constructor() {
    if (typeof window !== 'undefined') {
      // Enable debug logs if a flag is set in localStorage (developer only)
      try { this.debugEnabled = localStorage.getItem('audioDebug') === '1'; } catch {}
    }
  }

  public setDebugEnabled(enabled: boolean) { this.debugEnabled = enabled; }
  private dlog(...args: unknown[]) { if (this.debugEnabled) console.log('[AudioDebug]', ...args); }

  private async initialize() {
    if (this.isInitialized) return;
    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      this.isInitialized = true;
      if (this.debugEnabled || audioDebug()) {
        console.log('[AudioDebug] Initialized AudioContext', {
          state: this.audioContext.state,
        });
      }
    } catch (error) {
      console.error('❌ Failed to initialize lightweight chord playback:', error);
    }
  }

  private parseChord(chord: string): ChordNote[] {
    if (!chord || chord === 'N.C.' || chord === 'N/C' || chord === 'N') return [];
    let baseChord = chord;
    let bassSpecifier: string | undefined;

    // Support slash-degree notation like /3, /5, /b7 in addition to note names
    if (chord.includes('/')) {
      const parts = chord.split('/');
      baseChord = parts[0].trim();
      bassSpecifier = parts[1].trim();
    }

    const rootMatch = baseChord.match(/^[A-G][#b]?/);
    if (!rootMatch) return [];
    const root = rootMatch[0];
    const chordType = baseChord.slice(root.length);

    // Resolve bass specifier to an actual note name, if needed
    let bassNote: string | undefined;
    if (bassSpecifier) {
      if (NOTE_FREQUENCIES[bassSpecifier]) {
        bassNote = bassSpecifier; // it's a concrete note
      } else {
        // Try to interpret degree relative to the chord structure
        const typeKey = CHORD_TYPE_ALIASES[chordType.toLowerCase()] || 'major';
        const structure = CHORD_STRUCTURES[typeKey] || CHORD_STRUCTURES.major;
        const degreeMap: Record<string, number> = {
          '1': 0,
          '3': structure.includes(4) ? 4 : 3,
          '5': 7,
          '6': 9,
          '7': structure.includes(11) ? 11 : 10,
          'b7': 10,
          '#5': 8,
          'b5': 6,
          '9': 14
        };
        const semis = degreeMap[bassSpecifier];
        if (semis !== undefined) {
          const rootIdx = NOTE_INDEX_MAP[root];
          const noteIndex = (rootIdx + semis) % 12;
          bassNote = CHROMATIC_SCALE[noteIndex];
        }
      }
    }

    const notes = generateChordFrequencies(root, chordType, bassNote);
    if (audioDebug()) {
      console.log('[AudioDebug] parseChord result', { chord, baseChord, root, chordType, bassNote, notes });
    }
    return notes;
  }

  private createInstrumentSound(frequency: number, type: 'piano' | 'guitar', duration: number, volume: number, isBass: boolean) {
    if (!this.audioContext) return null;
    const now = this.audioContext.currentTime;
    const oscillators: OscillatorNode[] = [];

    const mainOscillator = this.audioContext.createOscillator();
    const harmonicOscillator = this.audioContext.createOscillator();
    const subOscillator = this.audioContext.createOscillator();
    
    const mainGain = this.audioContext.createGain();
    const harmonicGain = this.audioContext.createGain();
    const subGain = this.audioContext.createGain();
    const masterGain = this.audioContext.createGain();
    
    const filterNode = this.audioContext.createBiquadFilter();
    const dryGain = this.audioContext.createGain();
    const reverbGain = this.audioContext.createGain();
    const reverbFilterNode = this.audioContext.createBiquadFilter();
    const reverbMixGain = this.audioContext.createGain();
    const delayNode = this.audioContext.createDelay(0.3);

    mainOscillator.frequency.setValueAtTime(frequency, now);
    harmonicOscillator.frequency.setValueAtTime(frequency * 2, now);
    subOscillator.frequency.setValueAtTime(frequency * 0.5, now);

    if (type === 'piano') {
      mainOscillator.type = 'triangle';
      harmonicOscillator.type = 'sine';
      subOscillator.type = 'sine';
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(frequency * 6, now);
      filterNode.Q.setValueAtTime(0.5, now);
      
      if (isBass) {
        mainGain.gain.setValueAtTime(volume * 0.4, now);
        harmonicGain.gain.setValueAtTime(volume * 0.1, now);
        subGain.gain.setValueAtTime(volume * 0.5, now);
      } else {
        mainGain.gain.setValueAtTime(volume * 0.7, now);
        harmonicGain.gain.setValueAtTime(volume * 0.2, now);
        subGain.gain.setValueAtTime(volume * 0.1, now);
      }
    } else {
      mainOscillator.type = 'sawtooth';
      harmonicOscillator.type = 'square';
      subOscillator.type = 'triangle';
      filterNode.type = 'bandpass';
      filterNode.frequency.setValueAtTime(frequency * 3, now);
      filterNode.Q.setValueAtTime(2, now);

      if (isBass) {
        mainGain.gain.setValueAtTime(volume * 0.4, now);
        harmonicGain.gain.setValueAtTime(volume * 0.1, now);
        subGain.gain.setValueAtTime(volume * 0.5, now);
      } else {
        mainGain.gain.setValueAtTime(volume * 0.6, now);
        harmonicGain.gain.setValueAtTime(volume * 0.3, now);
        subGain.gain.setValueAtTime(volume * 0.1, now);
      }
    }

    const attack = type === 'piano' ? 0.05 : 0.02;
    const decay = type === 'piano' ? 0.2 : 0.1;
    const sustainLevel = type === 'piano' ? 0.7 : 0.5;
    const release = Math.min(duration * 0.3, type === 'piano' ? 1.5 : 1.0);
    const sustainDuration = Math.max(0, duration - attack - decay - release);
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(1, now + attack);
    masterGain.gain.linearRampToValueAtTime(sustainLevel, now + attack + decay);
    if (sustainDuration > 0) {
      masterGain.gain.setValueAtTime(sustainLevel, now + attack + decay + sustainDuration);
    }
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    mainOscillator.connect(mainGain);
    harmonicOscillator.connect(harmonicGain);
    subOscillator.connect(subGain);
    mainGain.connect(filterNode);
    harmonicGain.connect(filterNode);
    subGain.connect(filterNode);
    filterNode.connect(masterGain);

    dryGain.gain.setValueAtTime(type === 'piano' ? 0.85 : 0.75, now);
    reverbGain.gain.setValueAtTime(type === 'piano' ? 0.15 : 0.25, now);
    reverbFilterNode.type = 'lowpass';
    reverbFilterNode.frequency.setValueAtTime(4000, now);
    reverbFilterNode.Q.setValueAtTime(0.5, now);

    masterGain.connect(dryGain);
    masterGain.connect(delayNode);
    delayNode.connect(reverbMixGain);
    reverbMixGain.connect(reverbFilterNode);
    reverbFilterNode.connect(reverbGain);
    dryGain.connect(this.audioContext.destination);
    reverbGain.connect(this.audioContext.destination);

    oscillators.push(mainOscillator, harmonicOscillator, subOscillator);
    oscillators.forEach(osc => {
      osc.start(now);
      osc.stop(now + duration);
    });
    return mainOscillator;
  }

  async playChord(chord: string, duration: number = 2.0) {
    if (!this.options.enabled || !chord || chord === this.currentChord) return;
    if (!this.isInitialized) await this.initialize();
    if (!this.audioContext) return;
    try {
      const chordNotes = this.parseChord(chord);
      if (audioDebug()) console.log('[AudioDebug] playChord', { chord, duration, chordNotes });
      if (chordNotes.length === 0) return;
      this.fadeOutCurrentChord();
      this.currentChord = chord;
      if (this.options.pianoVolume > 0) {
        const basePianoVolume = (this.options.pianoVolume / 100) * 0.4; // 2x overall boost
        chordNotes.forEach(note => {
          const noteVolume = note.isBass ? basePianoVolume * 2.0 : basePianoVolume;
          const osc = this.createInstrumentSound(note.frequency, 'piano', duration, noteVolume, note.isBass);
          if (osc) this.activeOscillators.push(osc);
        });
      }
      if (this.options.guitarVolume > 0) {
        const baseGuitarVolume = (this.options.guitarVolume / 100) * 0.30; // 2x overall boost
        setTimeout(() => {
          chordNotes.forEach((note, index) => {
            setTimeout(() => {
              const noteVolume = note.isBass ? baseGuitarVolume * 2.0 : baseGuitarVolume;
              const osc = this.createInstrumentSound(note.frequency, 'guitar', duration * 0.8, noteVolume, note.isBass);
              if (osc) this.activeOscillators.push(osc);
            }, index * 20);
          });
        }, 50);
      }
      setTimeout(() => {
        if (this.currentChord === chord) this.currentChord = null;
      }, duration * 1000);
    } catch (error) {
      console.error('❌ Error playing chord:', error);
    }
  }

  private fadeOutCurrentChord() {
    if (this.activeOscillators.length === 0 || !this.audioContext) return;
    const fadeTime = 0.1;
    const now = this.audioContext.currentTime;
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop(now + fadeTime);
      } catch {}
    });
    setTimeout(() => {
      this.activeOscillators = [];
    }, fadeTime * 1000);
  }

  stopAll() {
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop();
      } catch {}
    });
    this.activeOscillators = [];
    this.currentChord = null;
  }

  updateOptions(options: Partial<LightweightChordPlaybackOptions>) {
    this.options = { ...this.options, ...options };
    if (options.enabled && !this.isInitialized) {
      this.initialize();
    }
  }

  getOptions(): LightweightChordPlaybackOptions {
    return { ...this.options };
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async testPlayback() {
    console.log('🎵 Testing lightweight chord playback...');
    if (!this.isInitialized) await this.initialize();
    await this.playChord('Cmaj7/G', 1.5);
  }

  dispose() {
    this.stopAll();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isInitialized = false;
  }
}

let lightweightChordPlaybackService: LightweightChordPlaybackService | null = null;
export const getLightweightChordPlaybackService = (): LightweightChordPlaybackService => {
  if (!lightweightChordPlaybackService) {
    lightweightChordPlaybackService = new LightweightChordPlaybackService();
  }
  return lightweightChordPlaybackService;
};