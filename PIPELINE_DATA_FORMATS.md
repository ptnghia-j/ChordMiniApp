# ChordMiniApp Pipeline Data Formats

## 🔧 Backend API Response Formats

### Beat Detection Response (`/api/detect-beats`)
```typescript
{
  "success": true,
  "beats": [0.350, 0.675, 1.024, 1.350, ...], // Raw beat times (seconds)
  "beat_info": [
    {
      "time": 0.350,
      "strength": 0.8,
      "beatNum": 1
    },
    // ... more beats
  ],
  "beats_with_positions": [
    {
      "time": 0.000,
      "beatNum": 3,
      "source": "padded"  // Timing compensation for pickup beats
    },
    {
      "time": 0.350,
      "beatNum": 1,
      "source": "detected" // Actual detected beat
    },
    // ... more beats
  ],
  "downbeats": [0.350, 1.675, 3.024, ...], // Downbeat times
  "downbeats_with_measures": [
    {
      "time": 0.350,
      "measureNum": 1
    },
    // ... more downbeats
  ],
  "bpm": 120.5,
  "time_signature": 3, // Detected time signature (3/4, 4/4, etc.)
  "model": "beat-transformer-light",
  "total_beats": 992,
  "duration": 180.5
}
```

### Chord Recognition Response (`/api/recognize-chords`)
```typescript
{
  "success": true,
  "chords": [
    {
      "start": 0.0,
      "end": 0.464,
      "chord": "N",        // "N" = No Chord
      "confidence": 0.9
    },
    {
      "start": 0.464,
      "end": 4.133,
      "chord": "D:min7",   // Chord in academic notation
      "confidence": 0.85
    },
    // ... more chords
  ],
  "total_chords": 156,
  "model": "chord-cnn-lstm",
  "chord_dict": "submission"
}
```

## 🎨 Frontend Data Structures

### Synchronized Chord Array (Core Data Structure)
```typescript
interface SynchronizedChord {
  chord: string;           // "N.C.", "D:min7", "C", etc.
  beatIndex: number;       // Index in original beats array
  beatNum: number;         // Beat number within measure (1-4 for 4/4)
  source?: 'detected' | 'padded'; // Beat source for styling
}

// Example:
[
  { chord: "N.C.", beatIndex: 0, beatNum: 3, source: "padded" },
  { chord: "D:min7", beatIndex: 1, beatNum: 1, source: "detected" },
  { chord: "D:min7", beatIndex: 2, beatNum: 2, source: "detected" },
  // ... continues for all beats
]
```

### ChordGrid Props Interface
```typescript
interface ChordGridProps {
  chords: string[];                    // ["N.C.", "D:min7", "D:min7", ...]
  beats: number[];                     // [0, 1, 2, 3, ...] (beat indices)
  beatNumbers?: number[];              // [3, 1, 2, 3, 1, 2, 3, ...] (beat positions)
  beatSources?: ('detected' | 'padded' | 'padding')[]; // Beat source info
  currentBeatIndex?: number;           // Current highlighted beat (-1 = none)
  timeSignature?: number;              // 3, 4, 5, etc.
  // ... other props
}
```

## 🔄 Critical Timing Calculations

### Backend Timing Compensation
```python
# Calculate timing offset between first chunk and chunking
first_chunk_first_detected = 0.350  # From first chunk processing
chunking_first_detected = 0.650     # From chunking processing
timing_offset = first_chunk_first_detected - chunking_first_detected  # -0.300s

# Apply offset to all chunking beats
corrected_beat_times = [beat_time + timing_offset for beat_time in beat_times]
# Result: 0.650s + (-0.300s) = 0.350s ✅
```

### Frontend Beat Index Calculation
```typescript
// Real-time beat highlighting during playback
const findCurrentBeatIndex = (currentTime: number, synchronizedChords: SynchronizedChord[], beats: BeatInfo[]) => {
  for (let i = 0; i < synchronizedChords.length; i++) {
    const syncChord = synchronizedChords[i];
    const beatIndex = syncChord.beatIndex;
    
    if (beatIndex < beats.length) {
      const beat = beats[beatIndex];
      const nextBeatTime = beatIndex + 1 < beats.length 
        ? beats[beatIndex + 1].time 
        : beat.time + 0.5;
      
      if (currentTime >= beat.time && currentTime < nextBeatTime) {
        return i; // Return synchronized chord index
      }
    }
  }
  return -1;
};
```

### Chord-to-Beat Alignment Algorithm
```typescript
// Core alignment logic with pickup beat handling
const alignChordToBeat = (chord: ChordDetectionResult, beats: BeatPosition[], hasPickupBeats: boolean) => {
  let bestBeatIndex = 0;
  let bestScore = Infinity;
  
  for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
    const beatTime = beats[beatIndex].time;
    const distance = Math.abs(chord.start - beatTime);
    
    if (distance <= 1.5) { // Within reasonable range
      let score = distance;
      
      // Pickup beat bonus
      if (hasPickupBeats && chord.start < 2.0 && beatIndex === 0) {
        score *= 0.5; // Strong preference for first beat (pickup)
      }
      
      // Downbeat bonus for later chords
      if (chord.start >= 2.0 && beats[beatIndex].beatNum === 1) {
        score *= 0.6; // Prefer downbeats for chord changes
      }
      
      // Prefer beats at/after chord start
      if (beatTime >= chord.start) {
        score *= 0.8;
      }
      
      if (score < bestScore) {
        bestScore = score;
        bestBeatIndex = beatIndex;
      }
    }
  }
  
  return bestBeatIndex;
};
```

## 🎵 Beat Numbering System

### Pickup Beat Handling
```
Regular 4/4 measure: [1, 2, 3, 4, 1, 2, 3, 4, ...]
3/4 with 1 pickup:   [3, 1, 2, 3, 1, 2, 3, 1, ...]
4/4 with 2 pickups:  [3, 4, 1, 2, 3, 4, 1, 2, ...]
```

### Frontend Measure Layout
```
Pickup Measure (3/4 with 1 pickup):
┌─────┬─────┬─────┐
│ PAD │ PAD │ N.C.│  <- Padding cells + pickup beat
│  ·  │  ·  │  3  │
└─────┴─────┴─────┘

Regular Measure:
┌─────┬─────┬─────┐
│D:min7│D:min7│ C  │  <- Regular beats
│  1  │  2  │  3  │
└─────┴─────┴─────┘
```
