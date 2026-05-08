import {
  findChordEventForPlayback,
  findChordEventIndexByBeatIndex,
  type ChordTimedEventLike,
} from '@/utils/chordEventLookup';

interface TestEvent extends ChordTimedEventLike {
  id: string;
}

const events: TestEvent[] = [
  { id: 'A', startTime: 0, endTime: 1, beatIndex: 0 },
  { id: 'B', startTime: 1, endTime: 2, beatIndex: 1 },
  { id: 'C', startTime: 2, endTime: 3.5, beatIndex: 3 },
];

const gappedEvents: TestEvent[] = [
  { id: 'A', startTime: 0, endTime: 1, beatIndex: 0 },
  { id: 'B', startTime: 1.2, endTime: 2, beatIndex: 2 },
];

describe('chordEventLookup', () => {
  describe('findChordEventIndexByBeatIndex', () => {
    it('returns -1 for negative beat indices or empty history', () => {
      expect(findChordEventIndexByBeatIndex([], 0)).toBe(-1);
      expect(findChordEventIndexByBeatIndex(events, -1)).toBe(-1);
    });

    it('returns the latest event whose beat index is not greater than the requested beat', () => {
      expect(findChordEventIndexByBeatIndex(events, 0)).toBe(0);
      expect(findChordEventIndexByBeatIndex(events, 2)).toBe(1);
      expect(findChordEventIndexByBeatIndex(events, 5)).toBe(2);
    });
  });

  describe('findChordEventForPlayback', () => {
    it('returns the exact event when current time falls inside it', () => {
      expect(findChordEventForPlayback(events, 1.25, 1, 0.05)?.id).toBe('B');
    });

    it('prefers the next beat-aligned event when it starts within tolerance near a boundary', () => {
      expect(findChordEventForPlayback(events, 0.95, 1, 0.1)?.id).toBe('B');
    });

    it('uses the beat-index event when exact time misses but the event is within the tolerance window', () => {
      expect(findChordEventForPlayback(events, 2.02, 3, 0.05)?.id).toBe('C');
    });

    it('can probe forward into a near-future event when beat lookup does not help', () => {
      expect(findChordEventForPlayback(gappedEvents, 1.16, -1, 0.05)?.id).toBe('B');
    });

    it('can probe backward into a just-finished event when slightly past its end', () => {
      expect(findChordEventForPlayback(gappedEvents, 1.04, -1, 0.05)?.id).toBe('A');
    });

    it('returns null when no event is close enough', () => {
      expect(findChordEventForPlayback(events, 10, 10, 0.05)).toBeNull();
    });
  });
});
