import { renderHook, act } from '@testing-library/react';
import { useModelState } from '@/hooks/useModelState';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock getSafeChordModel to return the requested model directly in tests
jest.mock('@/utils/modelFiltering', () => ({
  getSafeChordModel: jest.fn((model) => model), // Return the requested model as-is
}));

describe('useModelState Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes with default values when localStorage is empty', () => {
    localStorageMock.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useModelState());

    expect(result.current.beatDetector).toBe('beat-transformer');
    expect(result.current.chordDetector).toBe('chord-cnn-lstm');
    expect(result.current.modelsInitialized).toBe(false);
  });

  it('loads saved values from localStorage', () => {
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'chordmini_beat_detector') return 'madmom';
      if (key === 'chordmini_chord_detector') return 'btc-sl';
      return null;
    });

    const { result } = renderHook(() => useModelState());

    expect(result.current.beatDetector).toBe('madmom');
    expect(result.current.chordDetector).toBe('btc-sl');
  });

  it('ignores invalid values from localStorage', () => {
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'chordmini_beat_detector') return 'invalid-detector';
      if (key === 'chordmini_chord_detector') return 'invalid-chord';
      return null;
    });

    const { result } = renderHook(() => useModelState());

    expect(result.current.beatDetector).toBe('beat-transformer');
    expect(result.current.chordDetector).toBe('chord-cnn-lstm');
  });

  it('updates beat detector and persists to localStorage', () => {
    const { result } = renderHook(() => useModelState());

    act(() => {
      result.current.setBeatDetector('madmom');
    });

    expect(result.current.beatDetector).toBe('madmom');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('chordmini_beat_detector', 'madmom');
  });

  it('updates chord detector and persists to localStorage', () => {
    const { result } = renderHook(() => useModelState());

    act(() => {
      result.current.setChordDetector('btc-pl');
    });

    expect(result.current.chordDetector).toBe('btc-pl');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('chordmini_chord_detector', 'btc-pl');
  });

  it('updates refs when state changes', () => {
    const { result } = renderHook(() => useModelState());

    act(() => {
      result.current.setBeatDetector('auto');
    });

    expect(result.current.beatDetectorRef.current).toBe('auto');
  });

  it('initializes models after 1 second timer', () => {
    const { result } = renderHook(() => useModelState());

    expect(result.current.modelsInitialized).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.modelsInitialized).toBe(true);
  });

  it('cleans up timer on unmount', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const { unmount } = renderHook(() => useModelState());

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
