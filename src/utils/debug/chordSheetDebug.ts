const SHEET_DEBUG_LOCAL_STORAGE_KEY = 'chordminiSheetDebug';
const SHEET_DEBUG_VERBOSE_LOCAL_STORAGE_KEY = 'chordminiSheetDebugVerbose';
const AUTO_DEBUG_VIDEO_IDS = new Set(['RlBkvjVss-s']);

type DebugWindow = Window & {
  __CHORDMINI_SHEET_DEBUG__?: boolean;
  __CHORDMINI_SHEET_DEBUG_VERBOSE__?: boolean;
};

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function isAutoDebugVideoActive(): boolean {
  if (!hasWindow()) {
    return false;
  }

  const path = window.location.pathname;
  const match = path.match(/\/analyze\/([^/]+)/);
  const videoId = match?.[1];

  return typeof videoId === 'string' && AUTO_DEBUG_VIDEO_IDS.has(videoId);
}

export function isChordSheetDebugEnabled(): boolean {
  if (isAutoDebugVideoActive()) {
    return true;
  }

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

export function chordSheetDebugGroup(scope: string, message: string, payload?: unknown): void {
  if (!isChordSheetDebugEnabled()) {
    return;
  }

  const prefix = `[ChordMini][SheetDebug][${scope}] ${message}`;
  if (payload === undefined) {
    console.groupCollapsed(prefix);
    console.groupEnd();
    return;
  }

  console.groupCollapsed(prefix);
  console.log(payload);
  console.groupEnd();
}

export function isChordSheetDebugVerboseEnabled(): boolean {
  if (isAutoDebugVideoActive()) {
    return true;
  }

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
