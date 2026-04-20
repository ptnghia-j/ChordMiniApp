const SHEET_DEBUG_LOCAL_STORAGE_KEY = 'chordminiSheetDebug';
const SHEET_DEBUG_VERBOSE_LOCAL_STORAGE_KEY = 'chordminiSheetDebugVerbose';

type DebugWindow = Window & {
  __CHORDMINI_SHEET_DEBUG__?: boolean;
  __CHORDMINI_SHEET_DEBUG_VERBOSE__?: boolean;
};

export function isChordSheetDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const debugWindow = window as DebugWindow;
    if (debugWindow.__CHORDMINI_SHEET_DEBUG__ === true) {
      return true;
    }

    return window.localStorage.getItem(SHEET_DEBUG_LOCAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function chordSheetDebugLog(scope: string, message: string, payload?: unknown): void {
  if (!isChordSheetDebugEnabled()) {
    return;
  }

  const prefix = `[ChordMini][SheetDebug][${scope}] ${message}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }

  console.log(prefix, payload);
}

export function isChordSheetDebugVerboseEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const debugWindow = window as DebugWindow;
    if (debugWindow.__CHORDMINI_SHEET_DEBUG_VERBOSE__ === true) {
      return true;
    }

    return window.localStorage.getItem(SHEET_DEBUG_VERBOSE_LOCAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
