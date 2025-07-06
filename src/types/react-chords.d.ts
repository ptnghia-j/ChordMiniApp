/**
 * Type declarations for @tombatossals/react-chords
 */

declare module '@tombatossals/react-chords/lib/Chord' {
  import React from 'react';

  interface ChordPosition {
    frets: number[];
    fingers: number[];
    barres: number[];
    capo?: boolean;
    baseFret?: number;
  }

  interface Instrument {
    strings: number;
    fretsOnChord: number;
    name: string;
    keys: string[];
    tunings: {
      [key: string]: string[];
    };
  }

  interface ChordProps {
    chord: ChordPosition;
    instrument: Instrument;
    lite?: boolean;
  }

  const Chord: React.FC<ChordProps>;
  export default Chord;
}

declare module '@tombatossals/chords-db/lib/guitar.json' {
  interface ChordPosition {
    frets: number[];
    fingers: number[];
    baseFret: number;
    barres: number[];
    capo?: boolean;
    midi?: number[];
  }

  interface ChordData {
    key: string;
    suffix: string;
    positions: ChordPosition[];
  }

  interface ChordDatabase {
    main: {
      strings: number;
      fretsOnChord: number;
      name: string;
      numberOfChords: number;
    };
    tunings: {
      standard: string[];
    };
    keys: string[];
    suffixes: string[];
    chords: {
      [key: string]: ChordData[];
    };
  }

  const guitarChords: ChordDatabase;
  export default guitarChords;
}
