const BEAT_GRID_DEBUG_LOCAL_STORAGE_KEY = 'chordminiBeatGridDebug';
const BEAT_GRID_DEBUG_VERBOSE_LOCAL_STORAGE_KEY = 'chordminiBeatGridDebugVerbose';

type DebugWindow = Window & {
  __CHORDMINI_BEAT_GRID_DEBUG__?: boolean;
  __CHORDMINI_BEAT_GRID_DEBUG_VERBOSE__?: boolean;
};

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function isTruthyFlag(value: string | null): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function hasDebugQueryFlag(): boolean {
  if (!hasWindow()) {
    return false;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return isTruthyFlag(params.get('beatGridDebug')) || isTruthyFlag(params.get('debugBeatGrid'));
  } catch {
    return false;
  }
}

export function isBeatGridDebugEnabled(): boolean {
  if (!hasWindow()) {
    return false;
  }

  try {
    const debugWindow = window as DebugWindow;
    if (debugWindow.__CHORDMINI_BEAT_GRID_DEBUG__ === true) {
      return true;
    }

    if (hasDebugQueryFlag()) {
      return true;
    }

    return window.localStorage.getItem(BEAT_GRID_DEBUG_LOCAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isBeatGridDebugVerboseEnabled(): boolean {
  if (!hasWindow()) {
    return false;
  }

  try {
    const debugWindow = window as DebugWindow;
    if (debugWindow.__CHORDMINI_BEAT_GRID_DEBUG_VERBOSE__ === true) {
      return true;
    }

    return (
      hasDebugQueryFlag() ||
      window.localStorage.getItem(BEAT_GRID_DEBUG_VERBOSE_LOCAL_STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function beatGridDebugLog(scope: string, message: string, payload?: unknown): void {
  if (!isBeatGridDebugEnabled()) {
    return;
  }

  const prefix = `[ChordMini][BeatGridDebug][${scope}] ${message}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }

  console.log(prefix, payload);
}

export function beatGridDebugVerboseLog(scope: string, message: string, payload?: unknown): void {
  if (!isBeatGridDebugVerboseEnabled()) {
    return;
  }

  const prefix = `[ChordMini][BeatGridDebug][${scope}] ${message}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }

  console.log(prefix, payload);
}
